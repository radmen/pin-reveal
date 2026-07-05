import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  decryptLabels,
  deriveVaultKey,
  encryptLabels,
  forgetVault,
  loadVaultCredential,
  loadVaultData,
  storeVaultCredential,
  storeVaultData,
  type SavedLabel,
  type VaultEncryptedData
} from './vault-persistence';

const originalIndexedDB = globalThis.indexedDB;

function installEmptyIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
    writable: true
  });
}

function restoreIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
    writable: true
  });
}

function makePrfOutput(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(32).fill(1);
}

function makePrfSalt(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(32).fill(2);
}

function makeSavedLabel(label: string, lastUsedAt: number): SavedLabel {
  return {
    originalLabel: label,
    normalizedLabel: label,
    pinLength: 4,
    lastUsedAt
  };
}

beforeEach((): void => {
  installEmptyIndexedDB();
});

afterAll((): void => {
  restoreIndexedDB();
});

describe('vault persistence — credential', (): void => {
  it('returns null when no credential is stored', async (): Promise<void> => {
    await expect(loadVaultCredential()).resolves.toBeNull();
  });

  it('stores and loads a credential round-trip', async (): Promise<void> => {
    const credentialId = new Uint8Array([1, 2, 3, 4]);
    const prfSalt = new Uint8Array([5, 6, 7, 8]);

    await storeVaultCredential({ credentialId, prfSalt });
    const loaded = await loadVaultCredential();

    expect(loaded).not.toBeNull();
    // Array.from avoids Buffer vs Uint8Array cross-realm toEqual failures in fake-indexeddb
    expect(Array.from(loaded?.credentialId ?? [])).toEqual([1, 2, 3, 4]);
    expect(Array.from(loaded?.prfSalt ?? [])).toEqual([5, 6, 7, 8]);
  });
});

describe('vault persistence — encrypted data', (): void => {
  it('returns null when no vault data is stored', async (): Promise<void> => {
    await expect(loadVaultData()).resolves.toBeNull();
  });

  it('stores and loads encrypted data round-trip', async (): Promise<void> => {
    const data: VaultEncryptedData = {
      version: 1,
      iv: new Uint8Array(12).fill(3),
      ciphertext: new Uint8Array(64).fill(4)
    };

    await storeVaultData(data);
    const loaded = await loadVaultData();

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(Array.from(loaded?.iv ?? [])).toEqual(Array.from(data.iv));
    expect(Array.from(loaded?.ciphertext ?? [])).toEqual(
      Array.from(data.ciphertext)
    );
  });
});

describe('vault persistence — forgetVault', (): void => {
  it('deletes both credential and data', async (): Promise<void> => {
    const prfOutput = makePrfOutput();
    const prfSalt = makePrfSalt();
    const vaultKey = await deriveVaultKey(prfOutput, prfSalt);
    const data = await encryptLabels(vaultKey, [
      makeSavedLabel('test-label', 1)
    ]);

    await storeVaultCredential({ credentialId: new Uint8Array([9]), prfSalt });
    await storeVaultData(data);
    await forgetVault();

    await expect(loadVaultCredential()).resolves.toBeNull();
    await expect(loadVaultData()).resolves.toBeNull();
  });
});

describe('vault persistence — crypto helpers', (): void => {
  it('encrypt then decrypt returns the original label list', async (): Promise<void> => {
    const vaultKey = await deriveVaultKey(makePrfOutput(), makePrfSalt());
    const labels = [
      makeSavedLabel('front-door', 1),
      makeSavedLabel('visa', 2),
      makeSavedLabel('netflix', 3)
    ];

    const encrypted = await encryptLabels(vaultKey, labels);
    const decrypted = await decryptLabels(vaultKey, encrypted);

    expect(decrypted).toEqual(labels);
  });

  it('produces a fresh nonce (IV) on each encrypt call', async (): Promise<void> => {
    const vaultKey = await deriveVaultKey(makePrfOutput(), makePrfSalt());

    const first = await encryptLabels(vaultKey, [makeSavedLabel('label-a', 1)]);
    const second = await encryptLabels(vaultKey, [
      makeSavedLabel('label-a', 1)
    ]);

    // Same plaintext → different IV due to per-write random nonce
    expect(first.iv).not.toEqual(second.iv);
  });

  it('stores no plaintext label values outside the encrypted payload', async (): Promise<void> => {
    const prfOutput = makePrfOutput();
    const prfSalt = makePrfSalt();
    const vaultKey = await deriveVaultKey(prfOutput, prfSalt);
    const sensitiveLabel = 'my-secret-card';

    const encrypted = await encryptLabels(vaultKey, [
      makeSavedLabel(sensitiveLabel, 1)
    ]);
    await storeVaultData(encrypted);
    const loaded = await loadVaultData();

    expect(loaded).not.toBeNull();
    // The version and IV are non-secret metadata — fine to check
    expect(loaded?.version).toBe(1);
    expect(loaded?.iv.byteLength ?? loaded?.iv.length).toBe(12);
    // No plaintext in the ciphertext blob
    const ctString = new TextDecoder().decode(loaded?.ciphertext);
    expect(ctString).not.toContain(sensitiveLabel);
  });

  it('decrypts an empty label list', async (): Promise<void> => {
    const vaultKey = await deriveVaultKey(makePrfOutput(), makePrfSalt());

    const encrypted = await encryptLabels(vaultKey, []);
    const decrypted = await decryptLabels(vaultKey, encrypted);

    expect(decrypted).toEqual([]);
  });
});
