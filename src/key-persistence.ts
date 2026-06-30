const DATABASE_NAME = 'pinapp';
const STORE_NAME = 'keys';
const KEY_ID = 'master';

export class LoadKeyError extends Error {
  constructor(cause: unknown) {
    super('Failed to load master key.', { cause });
    this.name = 'LoadKeyError';
  }
}

export class StoreKeyError extends Error {
  constructor(cause: unknown) {
    super('Failed to store master key.', { cause });
    this.name = 'StoreKeyError';
  }
}

export class ForgetKeyError extends Error {
  constructor(cause: unknown) {
    super('Failed to forget master key.', { cause });
    this.name = 'ForgetKeyError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = (): void => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

export async function storeMasterKey(key: CryptoKey): Promise<void> {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');

      transaction.objectStore(STORE_NAME).put(key, KEY_ID);
      transaction.oncomplete = (): void => resolve();
      transaction.onabort = (): void => reject(transaction.error);
      transaction.onerror = (): void => reject(transaction.error);
    });
  } catch (cause) {
    throw new StoreKeyError(cause);
  }
}

export async function loadMasterKey(): Promise<CryptoKey | null> {
  try {
    const database = await openDatabase();

    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(KEY_ID);

      request.onsuccess = (): void =>
        resolve((request.result as CryptoKey) ?? null);
      request.onerror = (): void => reject(request.error);
    });
  } catch (cause) {
    throw new LoadKeyError(cause);
  }
}

export async function forgetMasterKey(): Promise<void> {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');

      transaction.objectStore(STORE_NAME).delete(KEY_ID);
      transaction.oncomplete = (): void => resolve();
      transaction.onabort = (): void => reject(transaction.error);
      transaction.onerror = (): void => reject(transaction.error);
    });
  } catch (cause) {
    throw new ForgetKeyError(cause);
  }
}
