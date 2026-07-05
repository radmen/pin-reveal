import { idbGet, idbPut, idbClear } from './idb';

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

export type SavedLabel = {
  originalLabel: string;
  normalizedLabel: string;
  pinLength: number;
  lastUsedAt: number;
};

export class VaultPersistenceError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'VaultPersistenceError';
  }
}

export async function loadVaultCredential(): Promise<VaultCredential | null> {
  try {
    return await idbGet<VaultCredential>(DATABASE_NAME, STORE_NAME, CRED_KEY);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to load Vault credential.', cause);
  }
}

export async function storeVaultCredential(
  credential: VaultCredential
): Promise<void> {
  try {
    await idbPut(DATABASE_NAME, STORE_NAME, CRED_KEY, credential);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to store Vault credential.', cause);
  }
}

export async function loadVaultData(): Promise<VaultEncryptedData | null> {
  try {
    return await idbGet<VaultEncryptedData>(
      DATABASE_NAME,
      STORE_NAME,
      DATA_KEY
    );
  } catch (cause) {
    throw new VaultPersistenceError('Failed to load Vault data.', cause);
  }
}

export async function storeVaultData(data: VaultEncryptedData): Promise<void> {
  try {
    await idbPut(DATABASE_NAME, STORE_NAME, DATA_KEY, data);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to store Vault data.', cause);
  }
}

export async function forgetVault(): Promise<void> {
  try {
    await idbClear(DATABASE_NAME, STORE_NAME);
  } catch (cause) {
    throw new VaultPersistenceError('Failed to forget Vault.', cause);
  }
}

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
  labels: SavedLabel[]
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
): Promise<SavedLabel[]> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.iv },
    vaultKey,
    data.ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as SavedLabel[];
}
