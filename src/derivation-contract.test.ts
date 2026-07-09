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
      'inverse detergent'
    );
    await expect(calculateLabelFingerprint(key, 'Visa')).resolves.toBe(
      'inverse inertia'
    );
    await expect(derivePin(key, 'Visa', 4)).resolves.toBe('2627');
    await expect(derivePin(key, 'Visa', 6)).resolves.toBe('512966');
  }, 120_000);

  it('does not collapse distinct usernames through label normalization', async (): Promise<void> => {
    const password = 'correct horse battery staple';
    const dottedKey = await deriveKey(password, 'user@example.com');
    const strippedKey = await deriveKey(password, 'userexamplecom');

    await expect(calculateLoginFingerprint(dottedKey)).resolves.not.toBe(
      await calculateLoginFingerprint(strippedKey)
    );
  }, 120_000);
});
