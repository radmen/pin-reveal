import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

type StoredRecords = Map<string, unknown>;

type MockRequest<T> = {
  error: unknown;
  result: T | undefined;
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
};

type MockTransaction = {
  error: unknown;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  objectStore: (name: string) => MockObjectStore;
};

type MockObjectStore = {
  delete: (key: string) => MockRequest<undefined>;
  get: (key: string) => MockRequest<unknown>;
  put: (value: unknown, key: string) => MockRequest<undefined>;
};

type MockDatabase = {
  createObjectStore: (name: string) => MockObjectStore;
  transaction: (name: string) => MockTransaction;
};

function createRequest<T>(): MockRequest<T> {
  return {
    error: null,
    result: undefined,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null
  };
}

function createObjectStore(records: StoredRecords): MockObjectStore {
  return {
    delete: (key: string): MockRequest<undefined> => {
      const request = createRequest<undefined>();

      records.delete(key);

      return request;
    },
    get: (key: string): MockRequest<unknown> => {
      const request = createRequest<unknown>();

      queueMicrotask((): void => {
        request.result = records.get(key);
        request.onsuccess?.();
      });

      return request;
    },
    put: (value: unknown, key: string): MockRequest<undefined> => {
      const request = createRequest<undefined>();

      records.set(key, value);

      return request;
    }
  };
}

function createDatabase(stores: Map<string, StoredRecords>): MockDatabase {
  return {
    createObjectStore: (name: string): MockObjectStore => {
      const records = new Map<string, unknown>();

      stores.set(name, records);

      return createObjectStore(records);
    },
    transaction: (name: string): MockTransaction => {
      const records = stores.get(name);

      if (!records) {
        throw new Error(`Missing object store: ${name}`);
      }

      const transaction: MockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        objectStore: (): MockObjectStore => createObjectStore(records)
      };

      queueMicrotask((): void => {
        transaction.oncomplete?.();
      });

      return transaction;
    }
  };
}

function createMemoryIndexedDB(): IDBFactory {
  const databases = new Map<string, MockDatabase>();

  return {
    open: (name: string): IDBOpenDBRequest => {
      const request = createRequest<MockDatabase>();

      queueMicrotask((): void => {
        let database = databases.get(name);

        if (!database) {
          const stores = new Map<string, StoredRecords>();

          database = createDatabase(stores);
          databases.set(name, database);
          request.result = database;
          request.onupgradeneeded?.();
        }

        request.result = database;
        request.onsuccess?.();
      });

      return request as unknown as IDBOpenDBRequest;
    }
  } as IDBFactory;
}

function installEmptyIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: createMemoryIndexedDB(),
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

function createFailingLoadRequestObjectStore(
  cause: unknown,
  getRequest: MockRequest<unknown>
): MockObjectStore {
  return {
    delete: (): MockRequest<undefined> => createRequest<undefined>(),
    get: (): MockRequest<unknown> => {
      queueMicrotask((): void => {
        getRequest.error = cause;
        getRequest.onerror?.();
      });

      return getRequest;
    },
    put: (): MockRequest<undefined> => createRequest<undefined>()
  };
}

function createFailingLoadRequestDatabase(cause: unknown): MockDatabase {
  const getRequest = createRequest<unknown>();

  return {
    createObjectStore: (name: string): MockObjectStore =>
      createObjectStore(new Map([[name, undefined]])),
    transaction: (): MockTransaction => ({
      error: null,
      oncomplete: null,
      onerror: null,
      objectStore: (): MockObjectStore =>
        createFailingLoadRequestObjectStore(cause, getRequest)
    })
  };
}

function installFailingLoadRequestIndexedDB(cause: unknown): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: (): IDBOpenDBRequest => {
        const openRequest = createRequest<MockDatabase>();
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
