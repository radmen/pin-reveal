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

function makeFakeCredential(
  extensionResults: object = { prf: { results: { first: fakePrfOutput } } }
): PublicKeyCredential {
  return {
    rawId: fakeRawId,
    getClientExtensionResults: (): object => extensionResults
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

    it('uses getClientCapabilities when available and returns its PRF extension flag', async (): Promise<void> => {
      installFakeWebAuthn({
        getClientCapabilities: () => Promise.resolve({ 'extension:prf': true })
      });

      await expect(checkPrfSupport()).resolves.toBe(true);
    });

    it('returns false when getClientCapabilities reports no PRF support', async (): Promise<void> => {
      installFakeWebAuthn({
        getClientCapabilities: () => Promise.resolve({ 'extension:prf': false })
      });

      await expect(checkPrfSupport()).resolves.toBe(false);
    });

    it('falls back to platform authenticator availability when getClientCapabilities is absent', async (): Promise<void> => {
      installFakeWebAuthn({
        isUserVerifyingPlatformAuthenticatorAvailable: () =>
          Promise.resolve(true)
      });

      await expect(checkPrfSupport()).resolves.toBe(true);
    });

    it('returns false when the platform authenticator fallback reports unavailable', async (): Promise<void> => {
      installFakeWebAuthn({
        isUserVerifyingPlatformAuthenticatorAvailable: () =>
          Promise.resolve(false)
      });

      await expect(checkPrfSupport()).resolves.toBe(false);
    });
  });

  describe('createVaultPasskey', (): void => {
    it('returns credentialId, prfSalt, and prfOutput on success', async (): Promise<void> => {
      const credential = makeFakeCredential();
      installFakeWebAuthn({ create: () => Promise.resolve(credential) });

      const result = await createVaultPasskey();

      expect(result.credentialId).toEqual(new Uint8Array(fakeRawId));
      expect(result.prfSalt).toBeInstanceOf(Uint8Array);
      expect(result.prfSalt.length).toBe(32);
      expect(result.prfOutput).toEqual(new Uint8Array(fakePrfOutput));
    });

    it('falls back to assertion when credential creation enables PRF without results', async (): Promise<void> => {
      const credential = makeFakeCredential({ prf: { enabled: true } });
      const assertion = makeFakeCredential();
      const get = vi.fn(() => Promise.resolve(assertion));
      installFakeWebAuthn({
        create: () => Promise.resolve(credential),
        get
      });

      const result = await createVaultPasskey();

      expect(result.credentialId).toEqual(new Uint8Array(fakeRawId));
      expect(result.prfSalt).toBeInstanceOf(Uint8Array);
      expect(result.prfSalt.length).toBe(32);
      expect(result.prfOutput).toEqual(new Uint8Array(fakePrfOutput));
      expect(get).toHaveBeenCalledOnce();
    });

    it('throws VaultPasskeyNotSupportedError when PRF results are absent', async (): Promise<void> => {
      const credential = makeFakeCredential({});
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

    it('throws VaultPasskeyNotSupportedError on NotSupportedError', async (): Promise<void> => {
      const notSupported = Object.assign(new Error('Unsupported'), {
        name: 'NotSupportedError'
      });
      installFakeWebAuthn({ create: () => Promise.reject(notSupported) });

      await expect(createVaultPasskey()).rejects.toBeInstanceOf(
        VaultPasskeyNotSupportedError
      );
    });

    it('throws VaultPasskeyNotSupportedError on SecurityError', async (): Promise<void> => {
      const securityError = Object.assign(new Error('Security error'), {
        name: 'SecurityError'
      });
      installFakeWebAuthn({ create: () => Promise.reject(securityError) });

      await expect(createVaultPasskey()).rejects.toBeInstanceOf(
        VaultPasskeyNotSupportedError
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
      const assertion = makeFakeCredential();
      installFakeWebAuthn({ get: () => Promise.resolve(assertion) });

      const credentialId = new Uint8Array(16).fill(5);
      const prfSalt = new Uint8Array(32).fill(7);
      const result = await getVaultPrfOutput(credentialId, prfSalt);

      expect(result).toEqual(new Uint8Array(fakePrfOutput));
    });

    it('requests assertion PRF with evalByCredential', async (): Promise<void> => {
      const assertion = makeFakeCredential();
      const get = vi.fn(() => Promise.resolve(assertion));
      installFakeWebAuthn({ get });

      const credentialId = new Uint8Array([251, 255]);
      const prfSalt = new Uint8Array(32).fill(7);
      await getVaultPrfOutput(credentialId, prfSalt);

      expect(get).toHaveBeenCalledWith({
        publicKey: expect.objectContaining({
          allowCredentials: [{ type: 'public-key', id: credentialId }],
          extensions: {
            prf: {
              evalByCredential: {
                '-_8': { first: prfSalt }
              }
            }
          }
        })
      });
    });

    it('throws VaultPasskeyNotSupportedError when PRF results are absent', async (): Promise<void> => {
      const assertion = makeFakeCredential({});
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

    it('throws VaultPasskeyNotSupportedError on NotSupportedError', async (): Promise<void> => {
      const notSupported = Object.assign(new Error('Unsupported'), {
        name: 'NotSupportedError'
      });
      installFakeWebAuthn({ get: () => Promise.reject(notSupported) });

      await expect(
        getVaultPrfOutput(new Uint8Array(16), new Uint8Array(32))
      ).rejects.toBeInstanceOf(VaultPasskeyNotSupportedError);
    });

    it('throws VaultPasskeyNotSupportedError on SecurityError', async (): Promise<void> => {
      const securityError = Object.assign(new Error('Security error'), {
        name: 'SecurityError'
      });
      installFakeWebAuthn({ get: () => Promise.reject(securityError) });

      await expect(
        getVaultPrfOutput(new Uint8Array(16), new Uint8Array(32))
      ).rejects.toBeInstanceOf(VaultPasskeyNotSupportedError);
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
