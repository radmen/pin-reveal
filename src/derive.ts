import { argon2idAsync } from '@noble/hashes/argon2.js';

const enc = (s: string) => new TextEncoder().encode(s);

// 256 pronounceable words, frozen — index = byte value
const WORDS: string[] = [];
{
  const ons = [
    'b',
    'd',
    'f',
    'g',
    'h',
    'j',
    'k',
    'l',
    'm',
    'n',
    'p',
    'r',
    's',
    't',
    'v',
    'z'
  ];
  const nuc = ['a', 'e', 'i', 'o'];
  const cod = ['n', 'r', 'l', 'k'];
  for (const o of ons)
    for (const n of nuc) for (const c of cod) WORDS.push(o + n + c);
}

// §5 label normalization (frozen v1)
export function normalize(raw: string): string {
  let s = (raw || '').normalize('NFC').toLowerCase();
  s = s.replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd');
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.trim().replace(/\s+/g, '-');
  s = s.replace(/[^a-z0-9-]/g, '');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s;
}

// §3 + §10: Argon2id → non-extractable HMAC-SHA256 key; zeroes raw bytes immediately
export async function deriveKey(
  password: string,
  username: string
): Promise<CryptoKey> {
  const salt = enc('pinapp|v1|salt|' + normalize(username));
  // ponytail: argon2idAsync yields to event loop internally, so the UI stays live during derivation
  const raw = await argon2idAsync(enc(password), salt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32
  });
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false, // extractable: false — the whole point
    ['sign']
  );
  raw.fill(0);
  return key;
}

async function mac(key: CryptoKey, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(message)));
}

// §6 digit extraction with rejection sampling (avoids modulo bias)
async function digits(
  key: CryptoKey,
  baseMsg: string,
  count: number
): Promise<number[]> {
  const out: number[] = [];
  for (let n = 0; out.length < count; n++) {
    const m = await mac(key, n === 0 ? baseMsg : `${baseMsg}|${n}`);
    for (const b of m) {
      if (b < 250) {
        out.push(b % 10);
        if (out.length === count) break;
      }
    }
  }
  return out;
}

async function twoWords(key: CryptoKey, message: string): Promise<string> {
  const m = await mac(key, message);
  return `${WORDS[m[0]]} ${WORDS[m[1]]}`;
}

export const loginFingerprint = (key: CryptoKey): Promise<string> =>
  twoWords(key, 'login|v1');

export const labelFingerprint = (
  key: CryptoKey,
  rawLabel: string
): Promise<string> => twoWords(key, `fp|v1|${normalize(rawLabel)}`);

export const derivePin = async (
  key: CryptoKey,
  rawLabel: string,
  length: number
): Promise<string> =>
  (await digits(key, `pin|v1|${normalize(rawLabel)}`, length)).join('');

// §10 IndexedDB persistence — stores the opaque CryptoKey object (no exportKey ever)
const DB_NAME = 'pinapp';
const STORE_NAME = 'keys';
const KEY_ID = 'master';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeKey(key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKey(): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(KEY_ID);
    request.onsuccess = () => resolve((request.result as CryptoKey) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function forgetKey(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
