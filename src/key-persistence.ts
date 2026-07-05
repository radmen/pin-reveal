import { idbGet, idbPut, idbDelete } from './idb';

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

export async function storeMasterKey(key: CryptoKey): Promise<void> {
  try {
    await idbPut(DATABASE_NAME, STORE_NAME, KEY_ID, key);
  } catch (cause) {
    throw new StoreKeyError(cause);
  }
}

export async function loadMasterKey(): Promise<CryptoKey | null> {
  try {
    return await idbGet<CryptoKey>(DATABASE_NAME, STORE_NAME, KEY_ID);
  } catch (cause) {
    throw new LoadKeyError(cause);
  }
}

export async function forgetMasterKey(): Promise<void> {
  try {
    await idbDelete(DATABASE_NAME, STORE_NAME, KEY_ID);
  } catch (cause) {
    throw new ForgetKeyError(cause);
  }
}
