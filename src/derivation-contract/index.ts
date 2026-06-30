import { argon2idAsync } from '@noble/hashes/argon2.js';
import words from './words.json';

const textEncoder = new TextEncoder();

function encode(value: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(value) as Uint8Array<ArrayBuffer>;
}

export function normalizeLabel(rawLabel: string): string {
  let normalizedLabel = (rawLabel || '').normalize('NFC').toLowerCase();
  normalizedLabel = normalizedLabel
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd');
  normalizedLabel = normalizedLabel.normalize('NFKD').replace(/\p{M}/gu, '');
  normalizedLabel = normalizedLabel.trim().replace(/\s+/g, '-');
  normalizedLabel = normalizedLabel.replace(/[^a-z0-9-]/g, '');
  normalizedLabel = normalizedLabel.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalizedLabel;
}

export async function deriveKey(
  password: string,
  username: string
): Promise<CryptoKey> {
  const salt = encode(`pinapp|v1|salt|${normalizeLabel(username)}`);
  const rawKey = await argon2idAsync(encode(password), salt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32
  });
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  rawKey.fill(0);
  return key;
}

async function calculateMac(
  key: CryptoKey,
  message: string
): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(message)));
}

async function calculateDigits(
  key: CryptoKey,
  baseMessage: string,
  count: number
): Promise<number[]> {
  const output: number[] = [];

  for (let n = 0; output.length < count; n++) {
    const message = n === 0 ? baseMessage : `${baseMessage}|${n}`;
    const mac = await calculateMac(key, message);

    for (const byte of mac) {
      if (byte >= 250) {
        continue;
      }

      output.push(byte % 10);

      if (output.length === count) {
        break;
      }
    }
  }

  return output;
}

async function calculateTwoWordFingerprint(
  key: CryptoKey,
  message: string
): Promise<string> {
  const mac = await calculateMac(key, message);
  return `${words.even[mac[0]]} ${words.odd[mac[1]]}`;
}

export function calculateLoginFingerprint(key: CryptoKey): Promise<string> {
  return calculateTwoWordFingerprint(key, 'login|v1');
}

export function calculateLabelFingerprint(
  key: CryptoKey,
  rawLabel: string
): Promise<string> {
  return calculateTwoWordFingerprint(key, `fp|v1|${normalizeLabel(rawLabel)}`);
}

export async function derivePin(
  key: CryptoKey,
  rawLabel: string,
  length: number
): Promise<string> {
  const digits = await calculateDigits(
    key,
    `pin|v1|${normalizeLabel(rawLabel)}`,
    length
  );
  return digits.join('');
}
