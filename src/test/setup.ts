import '@testing-library/jest-dom/vitest';

// ponytail: jsdom on Node 26 doesn't expose global.localStorage; stub the minimum the app uses.
const localStorageStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string): string | null => localStorageStore[key] ?? null,
    setItem: (key: string, value: string): void => {
      localStorageStore[key] = value;
    },
    removeItem: (key: string): void => {
      delete localStorageStore[key];
    },
    clear: (): void => {
      Object.keys(localStorageStore).forEach((k) => {
        delete localStorageStore[k];
      });
    }
  },
  writable: true
});
