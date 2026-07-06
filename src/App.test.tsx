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
  ForgetKeyError,
  loadMasterKey,
  LoadKeyError,
  StoreKeyError,
  storeMasterKey
} from './key-persistence';
import { subscribeToAppUpdate } from './pwa-update';
import {
  checkPrfSupport,
  createVaultPasskey,
  getVaultPrfOutput
} from './vault-passkey.adapter';
import {
  decryptLabels,
  deriveVaultKey,
  encryptLabels,
  forgetVault,
  loadVaultCredential,
  loadVaultData,
  storeVaultCredential,
  storeVaultData
} from './vault-persistence';

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

vi.mock(
  './pwa-update',
  (): { subscribeToAppUpdate: ReturnType<typeof vi.fn> } => ({
    subscribeToAppUpdate: vi.fn()
  })
);

vi.mock('./vault-passkey.adapter', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./vault-passkey.adapter')>();
  return {
    ...actual,
    checkPrfSupport: vi.fn(),
    createVaultPasskey: vi.fn(),
    getVaultPrfOutput: vi.fn()
  };
});

vi.mock('./vault-persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vault-persistence')>();
  return {
    ...actual,
    loadVaultCredential: vi.fn(),
    storeVaultCredential: vi.fn(),
    loadVaultData: vi.fn(),
    storeVaultData: vi.fn(),
    forgetVault: vi.fn(),
    deriveVaultKey: vi.fn(),
    encryptLabels: vi.fn(),
    decryptLabels: vi.fn()
  };
});

const mockedForgetMasterKey = vi.mocked(forgetMasterKey);
const mockedDeriveKey = vi.mocked(deriveKey);
const mockedLoadMasterKey = vi.mocked(loadMasterKey);
const mockedStoreMasterKey = vi.mocked(storeMasterKey);
const mockedSubscribeToAppUpdate = vi.mocked(subscribeToAppUpdate);
const mockedCheckPrfSupport = vi.mocked(checkPrfSupport);
const mockedCreateVaultPasskey = vi.mocked(createVaultPasskey);
const mockedGetVaultPrfOutput = vi.mocked(getVaultPrfOutput);
const mockedLoadVaultCredential = vi.mocked(loadVaultCredential);
const mockedStoreVaultCredential = vi.mocked(storeVaultCredential);
const mockedLoadVaultData = vi.mocked(loadVaultData);
const mockedStoreVaultData = vi.mocked(storeVaultData);
const mockedForgetVault = vi.mocked(forgetVault);
const mockedDeriveVaultKey = vi.mocked(deriveVaultKey);
const mockedEncryptLabels = vi.mocked(encryptLabels);
const mockedDecryptLabels = vi.mocked(decryptLabels);

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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise: (value: T) => void = () => {};
  let rejectPromise: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}

const fakeVaultEncryptedData = {
  version: 1,
  iv: new Uint8Array(12).fill(0),
  ciphertext: new Uint8Array(16).fill(0)
};
const fakeVaultCredential = {
  credentialId: new Uint8Array([1, 2, 3]),
  prfSalt: new Uint8Array([4, 5, 6])
};
const fakePasskeyCreation = {
  credentialId: new Uint8Array([1, 2, 3]),
  prfSalt: new Uint8Array([4, 5, 6]),
  prfOutput: new Uint8Array(32).fill(9)
};
function createVaultAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
}

beforeEach(async (): Promise<void> => {
  installIndexedDB();
  mockedDeriveKey.mockResolvedValue(await createKey());
  mockedForgetMasterKey.mockResolvedValue();
  mockedLoadMasterKey.mockResolvedValue(null);
  mockedStoreMasterKey.mockResolvedValue();
  mockedSubscribeToAppUpdate.mockReturnValue((): void => {});

  // vault: off by default so existing tests are unaffected
  mockedCheckPrfSupport.mockResolvedValue(false);
  mockedCreateVaultPasskey.mockResolvedValue(fakePasskeyCreation);
  mockedGetVaultPrfOutput.mockResolvedValue(new Uint8Array(32).fill(9));
  mockedLoadVaultCredential.mockResolvedValue(null);
  mockedStoreVaultCredential.mockResolvedValue();
  mockedLoadVaultData.mockResolvedValue(null);
  mockedStoreVaultData.mockResolvedValue();
  mockedForgetVault.mockResolvedValue();
  mockedDeriveVaultKey.mockResolvedValue(await createVaultAesKey());
  mockedEncryptLabels.mockResolvedValue(fakeVaultEncryptedData);
  mockedDecryptLabels.mockResolvedValue([]);
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

async function submitLabel(): Promise<void> {
  fireEvent.input(await screen.findByPlaceholderText(/e.g. visa/i), {
    target: { value: 'front-door' }
  });
  await waitFor((): void => {
    expect(screen.getByRole('button', { name: /generate pin/i })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('button', { name: /generate pin/i }));
  await screen.findByText(/pin ready/i);
  fireEvent.click(await screen.findByRole('button', { name: /proceed/i }));
}

afterEach((): void => {
  cleanup();
  vi.clearAllMocks();
});

describe('App', (): void => {
  it('shows a non-blocking update banner when a newer build is ready', async (): Promise<void> => {
    let notifyUpdateReady = (): void => {
      throw new Error('Update-ready callback was not registered.');
    };
    const refresh = vi.fn();
    mockedSubscribeToAppUpdate.mockImplementation(
      (onUpdateReady: () => void): (() => void) => {
        notifyUpdateReady = onUpdateReady;

        return refresh;
      }
    );

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();

    notifyUpdateReady();

    expect(await screen.findByRole('status')).toHaveTextContent(
      /a new version is ready/i
    );
    expect(screen.getByPlaceholderText(/identity/i)).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('applies a ready update only after the user clicks refresh', async (): Promise<void> => {
    let notifyUpdateReady = (): void => {
      throw new Error('Update-ready callback was not registered.');
    };
    const refresh = vi.fn();
    mockedSubscribeToAppUpdate.mockImplementation(
      (onUpdateReady: () => void): (() => void) => {
        notifyUpdateReady = onUpdateReady;

        return refresh;
      }
    );

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();

    notifyUpdateReady();

    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /refresh/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

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

  it('recovers locally from a worker derivation failure and allows retry', async (): Promise<void> => {
    const retryKey = await createKey();
    mockedDeriveKey
      .mockRejectedValueOnce(new Error('worker stack trace: raw failure'))
      .mockResolvedValueOnce(retryKey);

    render(<App />);

    const usernameInput = await screen.findByPlaceholderText(/identity/i);
    const passwordInput = screen.getByPlaceholderText(/passphrase/i);
    fireEvent.input(usernameInput, {
      target: { value: 'user@example.com' }
    });
    fireEvent.input(passwordInput, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: /generate fingerprint/i })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /we could not derive your key/i
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/worker stack/i);
    expect(screen.getByPlaceholderText(/identity/i)).toHaveValue(
      'user@example.com'
    );
    expect(screen.getByPlaceholderText(/passphrase/i)).toHaveValue(
      'correct horse battery staple'
    );
    expect(
      screen.getByRole('button', { name: /generate fingerprint/i })
    ).toBeEnabled();
    expect(mockedStoreMasterKey).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: /generate fingerprint/i })
    );

    expect(
      await screen.findByRole('button', { name: /proceed/i })
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockedDeriveKey).toHaveBeenCalledTimes(2);
  });

  it('waits for persistence before entering a persisted session', async (): Promise<void> => {
    const storeMasterKeyDeferred = createDeferred<void>();
    mockedStoreMasterKey.mockReturnValue(storeMasterKeyDeferred.promise);

    render(<App />);
    await submitLogin();

    const loginButton = screen.getByRole('button', { name: /logging in/i });
    expect(loginButton).toBeDisabled();
    expect(
      screen.queryByRole('heading', { name: /new pin/i })
    ).not.toBeInTheDocument();

    storeMasterKeyDeferred.resolve();

    expect(
      await screen.findByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/in-memory/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enters an in-memory session when login persistence fails', async (): Promise<void> => {
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('write quota exceeded'))
    );

    render(<App />);
    await submitLogin();
    fireEvent.click(await screen.findByText(/technical details/i));

    expect(
      await screen.findByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/in-memory/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /your key could not be saved for next time/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /failed to store master key/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /write quota exceeded/i
    );
  });

  it('keeps the in-memory badge visible across unlocked screens', async (): Promise<void> => {
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('private browsing'))
    );

    render(<App />);
    await submitLogin();
    await submitLabel();

    expect(
      await screen.findByText(/press reveal to show segment/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/in-memory/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '←' }));

    expect(
      await screen.findByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/in-memory/i)).toBeInTheDocument();
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

  it('logs out from an in-memory session without forgetting a persisted key', async (): Promise<void> => {
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('private browsing'))
    );

    render(<App />);
    await submitLogin();
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(
      screen.getByRole('button', { name: /open settings menu/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(mockedForgetMasterKey).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('waits to forget a persisted key before logging out', async (): Promise<void> => {
    const forgetMasterKeyDeferred = createDeferred<void>();
    mockedForgetMasterKey.mockReturnValue(forgetMasterKeyDeferred.promise);

    render(<App />);
    await submitLogin();
    await screen.findByRole('heading', { name: /new pin/i });
    await submitLabel();
    await screen.findByText(/press reveal to show segment/i);

    fireEvent.click(
      screen.getByRole('button', { name: /open settings menu/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(mockedForgetMasterKey).toHaveBeenCalledOnce();
    expect(mockedForgetVault).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/press reveal to show segment/i)
    ).toBeInTheDocument();

    forgetMasterKeyDeferred.resolve();

    expect(
      await screen.findByRole('heading', { name: /derive your key/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await submitLogin();

    expect(
      await screen.findByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/press reveal to show segment/i)
    ).not.toBeInTheDocument();
  });

  it('stays unlocked and shows a warning when persisted logout fails', async (): Promise<void> => {
    mockedForgetMasterKey.mockRejectedValue(
      new ForgetKeyError(new Error('IndexedDB delete failed'))
    );

    render(<App />);
    await submitLogin();
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(
      screen.getByRole('button', { name: /open settings menu/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    fireEvent.click(await screen.findByText(/technical details/i));

    expect(
      screen.getByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/reveal time/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /your saved key could not be forgotten/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /failed to forget master key/i
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /indexeddb delete failed/i
    );
    expect(
      screen.queryByRole('button', { name: /retry/i })
    ).not.toBeInTheDocument();
  });
});

describe('App — Vault', (): void => {
  it('hides vault controls in an in-memory session', async (): Promise<void> => {
    mockedStoreMasterKey.mockRejectedValue(
      new StoreKeyError(new Error('private browsing'))
    );

    render(<App />);
    await submitLogin();

    expect(
      await screen.findByRole('heading', { name: /new pin/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/in-memory/i)).toBeInTheDocument();
    // No vault button in label screen for in-memory sessions
    expect(
      screen.queryByRole('button', { name: /vault/i })
    ).not.toBeInTheDocument();
  });

  it('shows vault unavailable state when PRF is not supported', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(false);

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));

    expect(
      await screen.findByRole('heading', { name: /vault unavailable/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /enable vault/i })
    ).not.toBeInTheDocument();
  });

  it('shows a vault diagnostics checklist with support probe details', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockImplementation(async (recordDiagnostic) => {
      recordDiagnostic?.({
        step: 'support.client-capabilities',
        details: { 'extension:prf': false }
      });
      recordDiagnostic?.({
        step: 'support.platform-authenticator',
        details: { available: true }
      });
      recordDiagnostic?.({
        step: 'support.result',
        details: {
          supported: false,
          reason: 'client-capability-extension-prf'
        }
      });

      return false;
    });

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /open diagnostics/i })
    );

    expect(
      await screen.findByRole('heading', { name: /vault diagnostics/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Client PRF capability')).toBeInTheDocument();
    expect(
      screen.getByText('Platform authenticator available')
    ).toBeInTheDocument();
    expect(screen.getByText('Create extension results')).toBeInTheDocument();
    expect(screen.getByText('Assertion extension results')).toBeInTheDocument();
    expect(
      screen.getAllByText(/client-capability-extension-prf/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /copy report/i })).toBeEnabled();
  });

  it('runs the real vault enable flow from diagnostics', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(false);
    mockedCreateVaultPasskey.mockImplementation(async (recordDiagnostic) => {
      recordDiagnostic?.({
        step: 'create.request',
        details: {
          authenticatorAttachment: 'platform',
          residentKey: 'discouraged',
          userVerification: 'required',
          hasPrfEval: true
        }
      });
      recordDiagnostic?.({
        step: 'create.extension-results',
        details: { prf: { results: { first: { byteLength: 32 } } } }
      });
      recordDiagnostic?.({
        step: 'create.result',
        details: {
          supported: true,
          reason: 'create-prf-output',
          prfOutputByteLength: 32
        }
      });

      return fakePasskeyCreation;
    });

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /open diagnostics/i })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /try enabling vault/i })
    );

    await waitFor((): void => {
      expect(mockedStoreVaultCredential).toHaveBeenCalledOnce();
    });
    expect(mockedCreateVaultPasskey).toHaveBeenCalledOnce();
    expect(screen.getAllByText(/create-prf-output/i).length).toBeGreaterThan(0);
  });

  it('shows vault unenrolled state when PRF is supported but vault is not set up', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(true);
    mockedLoadVaultCredential.mockResolvedValue(null);

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));

    expect(
      await screen.findByRole('heading', { name: /vault is off/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /enable vault/i })
    ).toBeInTheDocument();
  });

  it('enables the vault and requires unlock before showing empty state', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(true);
    mockedLoadVaultCredential
      .mockResolvedValueOnce(null)
      .mockResolvedValue(fakeVaultCredential);

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));
    await screen.findByRole('heading', { name: /vault is off/i });

    fireEvent.click(screen.getByRole('button', { name: /enable vault/i }));

    expect(
      await screen.findByRole('heading', { name: /locked/i })
    ).toBeInTheDocument();
    expect(mockedStoreVaultCredential).toHaveBeenCalledOnce();
    expect(mockedStoreVaultData).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

    expect(await screen.findByText(/no saved labels yet/i)).toBeInTheDocument();
  });

  it('shows locked state and unlocks to empty vault', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(true);
    mockedLoadVaultCredential.mockResolvedValue(fakeVaultCredential);
    mockedLoadVaultData.mockResolvedValue(fakeVaultEncryptedData);
    mockedDecryptLabels.mockResolvedValue([]);

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));

    expect(
      await screen.findByRole('heading', { name: /locked/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

    expect(await screen.findByText(/no saved labels yet/i)).toBeInTheDocument();
    expect(mockedGetVaultPrfOutput).toHaveBeenCalledOnce();
  });

  it('disables the vault from unlocked state and returns to unenrolled', async (): Promise<void> => {
    mockedLoadMasterKey.mockResolvedValue(await createKey());
    mockedCheckPrfSupport.mockResolvedValue(true);
    mockedLoadVaultCredential
      .mockResolvedValueOnce(null)
      .mockResolvedValue(fakeVaultCredential);

    render(<App />);
    await screen.findByRole('heading', { name: /new pin/i });

    fireEvent.click(await screen.findByRole('button', { name: /vault/i }));
    await screen.findByRole('heading', { name: /vault is off/i });
    fireEvent.click(screen.getByRole('button', { name: /enable vault/i }));
    await screen.findByRole('heading', { name: /locked/i });
    fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));
    await screen.findByText(/no saved labels yet/i);

    // Disable vault
    fireEvent.click(screen.getByRole('button', { name: /disable vault/i }));

    expect(
      await screen.findByRole('heading', { name: /vault is off/i })
    ).toBeInTheDocument();
    expect(mockedForgetVault).toHaveBeenCalledOnce();
  });
});
