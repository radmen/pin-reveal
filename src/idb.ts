export function openIDBDatabase(
  name: string,
  storeName: string
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

export async function idbGet<T>(
  name: string,
  storeName: string,
  key: string
): Promise<T | null> {
  const database = await openIDBDatabase(name, storeName);
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .get(key);
    request.onsuccess = (): void => resolve((request.result as T) ?? null);
    request.onerror = (): void => reject(request.error);
  });
}

export async function idbPut(
  name: string,
  storeName: string,
  key: string,
  value: unknown
): Promise<void> {
  const database = await openIDBDatabase(name, storeName);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = (): void => resolve();
    transaction.onabort = (): void => reject(transaction.error);
    transaction.onerror = (): void => reject(transaction.error);
  });
}

export async function idbDelete(
  name: string,
  storeName: string,
  key: string
): Promise<void> {
  const database = await openIDBDatabase(name, storeName);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = (): void => resolve();
    transaction.onabort = (): void => reject(transaction.error);
    transaction.onerror = (): void => reject(transaction.error);
  });
}

export async function idbClear(name: string, storeName: string): Promise<void> {
  const database = await openIDBDatabase(name, storeName);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = (): void => resolve();
    transaction.onabort = (): void => reject(transaction.error);
    transaction.onerror = (): void => reject(transaction.error);
  });
}
