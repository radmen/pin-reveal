import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { findStoredKey, forgetKey, storeKey } from './key-store';

const originalIndexedDB = globalThis.indexedDB;
const textEncoder = new TextEncoder();

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

function createKey(rawKeyByte: number): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(rawKeyByte),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function calculateSignature(key: CryptoKey): Promise<number[]> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode('stored-key-check')
  );

  return Array.from(new Uint8Array(signature));
}

function expectStoredKey(key: CryptoKey | null): CryptoKey {
  if (!key) {
    throw new Error('Expected a stored key.');
  }

  return key;
}

beforeEach((): void => {
  installEmptyIndexedDB();
});

afterAll((): void => {
  restoreIndexedDB();
});

describe('key store', (): void => {
  it('returns null when no key is stored', async (): Promise<void> => {
    await expect(findStoredKey()).resolves.toBeNull();
  });

  it('stores and retrieves a CryptoKey', async (): Promise<void> => {
    const key = await createKey(1);

    await storeKey(key);

    const storedKey = await findStoredKey();

    await expect(
      calculateSignature(expectStoredKey(storedKey))
    ).resolves.toEqual(await calculateSignature(key));
  });

  it('replaces the stored key', async (): Promise<void> => {
    const originalKey = await createKey(1);
    const replacementKey = await createKey(2);

    await storeKey(originalKey);
    await storeKey(replacementKey);

    const storedKey = await findStoredKey();

    await expect(
      calculateSignature(expectStoredKey(storedKey))
    ).resolves.toEqual(await calculateSignature(replacementKey));
  });

  it('forgets the stored key', async (): Promise<void> => {
    await storeKey(await createKey(1));

    await forgetKey();

    await expect(findStoredKey()).resolves.toBeNull();
  });
});
