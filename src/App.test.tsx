import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { deriveKey } from './derive-key.adapter';
import {
  forgetMasterKey,
  loadMasterKey,
  LoadKeyError,
  StoreKeyError,
  storeMasterKey
} from './key-persistence';

vi.mock('./derive-key.adapter', () => ({
  deriveKey: vi.fn()
}));

vi.mock('./key-persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./key-persistence')>();

  return {
    ...actual,
    forgetMasterKey: vi.fn(),
    loadMasterKey: vi.fn(),
    storeMasterKey: vi.fn()
  };
});

const mockedForgetMasterKey = vi.mocked(forgetMasterKey);
const mockedDeriveKey = vi.mocked(deriveKey);
const mockedLoadMasterKey = vi.mocked(loadMasterKey);
const mockedStoreMasterKey = vi.mocked(storeMasterKey);

function createKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(1),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function installIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {},
    writable: true
  });
}

beforeEach(async (): Promise<void> => {
  installIndexedDB();
  mockedDeriveKey.mockResolvedValue(await createKey());
  mockedForgetMasterKey.mockResolvedValue();
  mockedLoadMasterKey.mockResolvedValue(null);
  mockedStoreMasterKey.mockResolvedValue();
});

async function submitLogin(): Promise<void> {
  fireEvent.input(await screen.findByPlaceholderText(/identity/i), {
    target: { value: 'user@example.com' }
  });
  fireEvent.input(screen.getByPlaceholderText(/passphrase/i), {
    target: { value: 'correct horse battery staple' }
  });
  fireEvent.click(
    screen.getByRole('button', { name: /generate fingerprint/i })
  );
  fireEvent.click(await screen.findByRole('button', { name: /proceed/i }));
}

afterEach((): void => {
  cleanup();
  vi.clearAllMocks();
});

describe('App', (): void => {
  it('renders the product heading', async (): Promise<void> => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();
  });

  it('shows a dismissible startup storage warning without blocking login', async (): Promise<void> => {
    mockedLoadMasterKey.mockRejectedValue(
      new LoadKeyError(new Error('IndexedDB open failed'))
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /your saved key could not be loaded/i
    );

    fireEvent.click(screen.getByRole('button', { name: /dismiss warning/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not show a storage warning when no master key is stored', async (): Promise<void> => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows expandable technical details for startup storage failures', async (): Promise<void> => {
    mockedLoadMasterKey.mockRejectedValue(
      new LoadKeyError(new Error('private browsing blocks IndexedDB'))
    );

    render(<App />);

    fireEvent.click(await screen.findByText(/technical details/i));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /failed to load master key/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /private browsing blocks indexeddb/i
    );
  });

  it('keeps an existing warning after a successful persistence operation', async (): Promise<void> => {
    mockedLoadMasterKey.mockRejectedValue(
      new LoadKeyError(new Error('startup load failed'))
    );

    render(<App />);
    await submitLogin();

    expect(screen.getByRole('alert')).toHaveTextContent(
      /your saved key could not be loaded/i
    );
  });

  it('allows a later storage failure to replace a dismissed warning', async (): Promise<void> => {
    mockedLoadMasterKey.mockRejectedValue(
      new LoadKeyError(new Error('startup load failed'))
    );
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('write quota exceeded'))
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /dismiss warning/i })
    );

    await submitLogin();
    fireEvent.click(await screen.findByText(/technical details/i));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /your key could not be saved for next time/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /failed to store master key/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /write quota exceeded/i
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /startup load failed/i
    );
  });

  it('clears an existing warning after the user successfully logs out', async (): Promise<void> => {
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('write quota exceeded'))
    );

    render(<App />);
    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /your key could not be saved for next time/i
    );

    fireEvent.click(
      screen.getByRole('button', { name: /open settings menu/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor((): void => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
