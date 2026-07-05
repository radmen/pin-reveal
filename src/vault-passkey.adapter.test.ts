import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkPrfSupport,
  createVaultPasskey,
  getVaultPrfOutput,
  VaultPasskeyCancelledError,
  VaultPasskeyError,
  VaultPasskeyNotSupportedError
} from './vault-passkey.adapter';

const fakePrfOutput = new Uint8Array(32).fill(42).buffer;
const fakeRawId = new Uint8Array(16).fill(1).buffer;

// ponytail: explicit noPrf sentinel avoids the JS default-parameter gotcha where
// makeFakeCredential() would still trigger the default value.
function makeFakeCredential(prfFirst?: ArrayBuffer): PublicKeyCredential {
  return {
    rawId: fakeRawId,
    getClientExtensionResults: (): object =>
      prfFirst !== undefined ? { prf: { results: { first: prfFirst } } } : {}
  } as unknown as PublicKeyCredential;
}

function installFakeWebAuthn(overrides: {
  create?: () => Promise<unknown>;
  get?: () => Promise<unknown>;
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
}): void {
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable:
        overrides.isUserVerifyingPlatformAuthenticatorAvailable ??
        (() => Promise.resolve(true)),
      ...(overrides.getClientCapabilities
        ? { getClientCapabilities: overrides.getClientCapabilities }
        : {})
    },
    writable: true
  });
  Object.defineProperty(globalThis.navigator, 'credentials', {
    configurable: true,
    value: {
      create: overrides.create ?? vi.fn(),
      get: overrides.get ?? vi.fn()
    },
    writable: true
  });
}

const originalPublicKeyCredential = (
  globalThis as unknown as Record<string, unknown>
)['PublicKeyCredential'];

afterEach((): void => {
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: originalPublicKeyCredential,
    writable: true
  });
});

describe('vault passkey adapter', (): void => {
  describe('checkPrfSupport', (): void => {
    it('returns false when PublicKeyCredential is unavailable', async (): Promise<void> => {
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        configurable: true,
        value: undefined,
        writable: true
      });

      await expect(checkPrfSupport()).resolves.toBe(false);
    });

    it('uses getClientCapabilities when available and returns its prf flag', async (): Promise<void> => {
      installFakeWebAuthn({
        getClientCapabilities: () => Promise.resolve({ prf: true })
      });

      await expect(checkPrfSupport()).resolves.toBe(true);
    });

    it('returns false when getClientCapabilities reports no prf', async (): Promise<void> => {
      installFakeWebAuthn({
        getClientCapabilities: () => Promise.resolve({ prf: false })
      });

      await expect(checkPrfSupport()).resolves.toBe(false);
    });

    it('returns false when getClientCapabilities is absent', async (): Promise<void> => {
      installFakeWebAuthn({
        isUserVerifyingPlatformAuthenticatorAvailable: () =>
          Promise.resolve(true)
      });

      await expect(checkPrfSupport()).resolves.toBe(false);
    });
  });

  describe('createVaultPasskey', (): void => {
    it('returns credentialId, prfSalt, and prfOutput on success', async (): Promise<void> => {
      const credential = makeFakeCredential(fakePrfOutput);
      installFakeWebAuthn({ create: () => Promise.resolve(credential) });

      const result = await createVaultPasskey();

      expect(result.credentialId).toEqual(new Uint8Array(fakeRawId));
      expect(result.prfSalt).toBeInstanceOf(Uint8Array);
      expect(result.prfSalt.length).toBe(32);
      expect(result.prfOutput).toEqual(new Uint8Array(fakePrfOutput));
    });

    it('throws VaultPasskeyNotSupportedError when PRF results are absent', async (): Promise<void> => {
      const credential = makeFakeCredential();
      installFakeWebAuthn({ create: () => Promise.resolve(credential) });

      await expect(createVaultPasskey()).rejects.toBeInstanceOf(
        VaultPasskeyNotSupportedError
      );
    });

    it('throws VaultPasskeyCancelledError on NotAllowedError', async (): Promise<void> => {
      const notAllowed = Object.assign(new Error('Not allowed'), {
        name: 'NotAllowedError'
      });
      installFakeWebAuthn({ create: () => Promise.reject(notAllowed) });

      await expect(createVaultPasskey()).rejects.toBeInstanceOf(
        VaultPasskeyCancelledError
      );
    });

    it('wraps other errors in VaultPasskeyError', async (): Promise<void> => {
      const cause = new Error('hardware failure');
      installFakeWebAuthn({ create: () => Promise.reject(cause) });

      const rejection = await createVaultPasskey().catch((e: unknown) => e);
      expect(rejection).toBeInstanceOf(VaultPasskeyError);
      expect((rejection as VaultPasskeyError).cause).toBe(cause);
    });

    it('throws VaultPasskeyNotSupportedError when PublicKeyCredential is absent', async (): Promise<void> => {
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        configurable: true,
        value: undefined,
        writable: true
      });

      await expect(createVaultPasskey()).rejects.toBeInstanceOf(
        VaultPasskeyNotSupportedError
      );
    });
  });

  describe('getVaultPrfOutput', (): void => {
    it('returns PRF output on successful assertion', async (): Promise<void> => {
      const assertion = makeFakeCredential(fakePrfOutput);
      installFakeWebAuthn({ get: () => Promise.resolve(assertion) });

      const credentialId = new Uint8Array(16).fill(5);
      const prfSalt = new Uint8Array(32).fill(7);
      const result = await getVaultPrfOutput(credentialId, prfSalt);

      expect(result).toEqual(new Uint8Array(fakePrfOutput));
    });

    it('throws VaultPasskeyNotSupportedError when PRF results are absent', async (): Promise<void> => {
      const assertion = makeFakeCredential();
      installFakeWebAuthn({ get: () => Promise.resolve(assertion) });

      await expect(
        getVaultPrfOutput(new Uint8Array(16), new Uint8Array(32))
      ).rejects.toBeInstanceOf(VaultPasskeyNotSupportedError);
    });

    it('throws VaultPasskeyCancelledError on NotAllowedError', async (): Promise<void> => {
      const notAllowed = Object.assign(new Error('Not allowed'), {
        name: 'NotAllowedError'
      });
      installFakeWebAuthn({ get: () => Promise.reject(notAllowed) });

      await expect(
        getVaultPrfOutput(new Uint8Array(16), new Uint8Array(32))
      ).rejects.toBeInstanceOf(VaultPasskeyCancelledError);
    });

    it('wraps other errors in VaultPasskeyError', async (): Promise<void> => {
      const cause = new Error('biometric sensor failure');
      installFakeWebAuthn({ get: () => Promise.reject(cause) });

      const rejection = await getVaultPrfOutput(
        new Uint8Array(16),
        new Uint8Array(32)
      ).catch((e: unknown) => e);
      expect(rejection).toBeInstanceOf(VaultPasskeyError);
      expect((rejection as VaultPasskeyError).cause).toBe(cause);
    });
  });
});
