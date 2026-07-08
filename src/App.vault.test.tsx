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
  loadMasterKey,
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

function createKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(1),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function createVaultAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
}

function installIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {},
    writable: true
  });
}

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

beforeEach(async (): Promise<void> => {
  installIndexedDB();
  mockedDeriveKey.mockResolvedValue(await createKey());
  mockedLoadMasterKey.mockResolvedValue(null);
  mockedStoreMasterKey.mockResolvedValue();
  mockedSubscribeToAppUpdate.mockReturnValue((): void => {});

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

afterEach((): void => {
  cleanup();
  vi.clearAllMocks();
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
          residentKey: 'required',
          requireResidentKey: true,
          userVerification: 'required',
          hasCredProps: true,
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

    fireEvent.click(screen.getByRole('button', { name: /disable vault/i }));

    expect(
      await screen.findByRole('heading', { name: /vault is off/i })
    ).toBeInTheDocument();
    expect(mockedForgetVault).toHaveBeenCalledOnce();
  });
});
