import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  ForgetKeyError,
  forgetMasterKey,
  LoadKeyError,
  loadMasterKey,
  StoreKeyError,
  storeMasterKey
} from './key-persistence';

const originalIndexedDB = globalThis.indexedDB;
const textEncoder = new TextEncoder();

type MockRequest<T> = {
  error: unknown;
  result: T | undefined;
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
};

function createRequest<T>(): MockRequest<T> {
  return {
    error: null,
    result: undefined,
    onerror: null,
    onsuccess: null
  };
}

function installEmptyIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
    writable: true
  });
}

function installFailingIndexedDB(cause: unknown): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: vi.fn(() => {
        throw cause;
      })
    },
    writable: true
  });
}

function createFailingLoadRequestDatabase(cause: unknown): IDBDatabase {
  const getRequest = createRequest<unknown>();

  return {
    transaction: () => ({
      objectStore: () => ({
        get: (): MockRequest<unknown> => {
          queueMicrotask((): void => {
            getRequest.error = cause;
            getRequest.onerror?.();
          });

          return getRequest;
        }
      })
    })
  } as unknown as IDBDatabase;
}

function installFailingLoadRequestIndexedDB(cause: unknown): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: (): IDBOpenDBRequest => {
        const openRequest = createRequest<IDBDatabase>();
        const database = createFailingLoadRequestDatabase(cause);

        queueMicrotask((): void => {
          openRequest.result = database;
          openRequest.onsuccess?.();
        });

        return openRequest as unknown as IDBOpenDBRequest;
      }
    },
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

function getStoredKey(key: CryptoKey | null): CryptoKey {
  if (!key) {
    throw new Error('Expected a stored key.');
  }

  return key;
}

function openLegacyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pinapp', 1);

    request.onupgradeneeded = (): void => {
      request.result.createObjectStore('keys');
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

async function storeLegacyMasterKey(key: CryptoKey): Promise<void> {
  const database = await openLegacyDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('keys', 'readwrite');

    transaction.objectStore('keys').put(key, 'master');
    transaction.oncomplete = (): void => resolve();
    transaction.onerror = (): void => reject(transaction.error);
  });
}

beforeEach((): void => {
  installEmptyIndexedDB();
});

afterAll((): void => {
  restoreIndexedDB();
});

describe('key persistence', (): void => {
  it('returns null when no master key is stored', async (): Promise<void> => {
    await expect(loadMasterKey()).resolves.toBeNull();
  });

  it('stores and loads a master key', async (): Promise<void> => {
    const key = await createKey(1);

    await storeMasterKey(key);

    const storedKey = await loadMasterKey();

    await expect(calculateSignature(getStoredKey(storedKey))).resolves.toEqual(
      await calculateSignature(key)
    );
  });

  it('replaces the stored master key', async (): Promise<void> => {
    const originalKey = await createKey(1);
    const replacementKey = await createKey(2);

    await storeMasterKey(originalKey);
    await storeMasterKey(replacementKey);

    const storedKey = await loadMasterKey();

    await expect(calculateSignature(getStoredKey(storedKey))).resolves.toEqual(
      await calculateSignature(replacementKey)
    );
  });

  it('loads master keys stored with the legacy IndexedDB identifiers', async (): Promise<void> => {
    const key = await createKey(3);

    await storeLegacyMasterKey(key);

    const storedKey = await loadMasterKey();

    await expect(calculateSignature(getStoredKey(storedKey))).resolves.toEqual(
      await calculateSignature(key)
    );
  });

  it('forgets the stored master key', async (): Promise<void> => {
    await storeMasterKey(await createKey(1));

    await forgetMasterKey();

    await expect(loadMasterKey()).resolves.toBeNull();
  });

  it('rejects load failures with an operation error and cause', async (): Promise<void> => {
    const cause = 'indexeddb unavailable';

    installFailingIndexedDB(cause);

    await expect(loadMasterKey()).rejects.toMatchObject({
      cause,
      message: 'Failed to load master key.'
    });
    await expect(loadMasterKey()).rejects.toBeInstanceOf(LoadKeyError);
  });

  it('rejects load request failures instead of returning null', async (): Promise<void> => {
    const cause = new Error('read failed');

    installFailingLoadRequestIndexedDB(cause);

    await expect(loadMasterKey()).rejects.toMatchObject({
      cause,
      message: 'Failed to load master key.'
    });
  });

  it('rejects store failures with an operation error and cause', async (): Promise<void> => {
    const cause = new Error('blocked');

    installFailingIndexedDB(cause);

    await expect(storeMasterKey(await createKey(1))).rejects.toMatchObject({
      cause,
      message: 'Failed to store master key.'
    });
    await expect(storeMasterKey(await createKey(1))).rejects.toBeInstanceOf(
      StoreKeyError
    );
  });

  it('rejects forget failures with an operation error and cause', async (): Promise<void> => {
    const cause = new Error('blocked');

    installFailingIndexedDB(cause);

    await expect(forgetMasterKey()).rejects.toMatchObject({
      cause,
      message: 'Failed to forget master key.'
    });
    await expect(forgetMasterKey()).rejects.toBeInstanceOf(ForgetKeyError);
  });
});
