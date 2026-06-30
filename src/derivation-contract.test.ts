import { describe, expect, it } from 'vitest';
import {
  calculateLabelFingerprint,
  calculateLoginFingerprint,
  deriveKey,
  derivePin,
  normalizeLabel
} from './derivation-contract';

describe('Derivation Contract', (): void => {
  it.each([
    ['Visa', 'visa'],
    ['VISA', 'visa'],
    ['  Front  Door  ', 'front-door'],
    ['work phone', 'work-phone'],
    ['Poczta Główna', 'poczta-glowna'],
    ['Główna', 'glowna'],
    ['AT&T', 'att'],
    ['Mr. Smith', 'mr-smith']
  ])('normalizes %s to %s', (rawLabel, normalizedLabel): void => {
    expect(normalizeLabel(rawLabel)).toBe(normalizedLabel);
  });

  it('preserves known fingerprint and PIN fixtures', async (): Promise<void> => {
    const key = await deriveKey(
      'correct horse battery staple',
      'alice@example.com'
    );

    await expect(calculateLoginFingerprint(key)).resolves.toBe(
      'commence corporate'
    );
    await expect(calculateLabelFingerprint(key, 'Visa')).resolves.toBe(
      'tracker phonetic'
    );
    await expect(derivePin(key, 'Visa', 4)).resolves.toBe('6530');
    await expect(derivePin(key, 'Visa', 6)).resolves.toBe('653082');
  }, 120_000);
});
