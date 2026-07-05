const DATABASE_NAME = 'pinapp-vault';
const STORE_NAME = 'vault';
const CRED_KEY = 'cred';
const DATA_KEY = 'data';

export type VaultCredential = {
  credentialId: Uint8Array<ArrayBuffer>;
  prfSalt: Uint8Array<ArrayBuffer>;
};

export type VaultEncryptedData = {
  version: number;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
};

export class VaultPersistenceError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'VaultPersistenceError';
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

async function getItem<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(key);
    request.onsuccess = (): void => resolve((request.result as T) ?? null);
    request.onerror = (): void => reject(request.error);
  });
}

async function putItem(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = (): void => resolve();
    transaction.onabort = (): void => reject(transaction.error);
    transaction.onerror = (): void => reject(transaction.error);
  });
}

async function clearAll(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = (): void => resolve();
    transaction.onabort = (): void => reject(transaction.error);
    transaction.onerror = (): void => reject(transaction.error);
  });
}

export async function loadVaultCredential(): Promise<VaultCredential | null> {
  try {
    return await getItem<VaultCredential>(CRED_KEY);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to load Vault credential.', cause);
  }
}

export async function storeVaultCredential(
  credential: VaultCredential
): Promise<void> {
  try {
    await putItem(CRED_KEY, credential);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to store Vault credential.', cause);
  }
}

export async function loadVaultData(): Promise<VaultEncryptedData | null> {
  try {
    return await getItem<VaultEncryptedData>(DATA_KEY);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to load Vault data.', cause);
  }
}

export async function storeVaultData(data: VaultEncryptedData): Promise<void> {
  try {
    await putItem(DATA_KEY, data);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to store Vault data.', cause);
  }
}

export async function forgetVault(): Promise<void> {
  try {
    await clearAll();
  } catch (cause) {
    throw new VaultPersistenceError('Failed to forget Vault.', cause);
  }
}

// ── Crypto helpers ──

export async function deriveVaultKey(
  prfOutput: Uint8Array<ArrayBuffer>,
  prfSalt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
    'deriveKey'
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: prfSalt,
      info: new TextEncoder().encode('pinderive-vault-v1')
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptLabels(
  vaultKey: CryptoKey,
  labels: string[]
): Promise<VaultEncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(labels));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, plaintext)
  );
  return { version: 1, iv, ciphertext };
}

export async function decryptLabels(
  vaultKey: CryptoKey,
  data: VaultEncryptedData
): Promise<string[]> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.iv },
    vaultKey,
    data.ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as string[];
}
