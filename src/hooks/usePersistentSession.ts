import { useEffect, useState } from 'preact/hooks';
import type { KeyPersistenceError } from '../components/KeyPersistenceWarningBanner';
import {
  ForgetKeyError,
  forgetMasterKey,
  LoadKeyError,
  loadMasterKey,
  StoreKeyError,
  storeMasterKey
} from '../key-persistence';
import { forgetVault } from '../vault-persistence';

export type SessionOutcome = 'persisted' | 'in-memory';

export type UnlockedSession = {
  key: CryptoKey;
  outcome: SessionOutcome;
};

function findInitialSession(): UnlockedSession | null | undefined {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return undefined;
}

export function usePersistentSession(
  initializeVaultStatus: () => Promise<void>,
  resetAfterLogout: () => void
): {
  session: UnlockedSession | null | undefined;
  keyPersistenceError: KeyPersistenceError | null;
  dismissKeyPersistenceError(): void;
  login(confirmedKey: CryptoKey): Promise<void>;
  logout(): void;
} {
  const [session, setSession] = useState<UnlockedSession | null | undefined>(
    findInitialSession
  );
  const [keyPersistenceError, setKeyPersistenceError] =
    useState<KeyPersistenceError | null>(null);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    void loadMasterKey()
      .then((loadedKey) => {
        if (loadedKey) {
          setSession({ key: loadedKey, outcome: 'persisted' });
          void initializeVaultStatus();
        } else {
          setSession(null);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof LoadKeyError) {
          setKeyPersistenceError(error);
          setSession(null);
          return;
        }

        throw error;
      });
  }, [initializeVaultStatus]);

  async function login(confirmedKey: CryptoKey): Promise<void> {
    try {
      await storeMasterKey(confirmedKey);
      setSession({ key: confirmedKey, outcome: 'persisted' });
      void initializeVaultStatus();
    } catch (error: unknown) {
      if (error instanceof StoreKeyError) {
        setKeyPersistenceError(error);
        setSession({ key: confirmedKey, outcome: 'in-memory' });
        return;
      }

      throw error;
    }
  }

  function logout(): void {
    const activeSession = session;

    if (!activeSession) {
      return;
    }

    if (activeSession.outcome === 'in-memory') {
      resetAfterLogout();
      setSession(null);
      setKeyPersistenceError(null);
      return;
    }

    Promise.all([forgetMasterKey(), forgetVault()])
      .then(() => {
        resetAfterLogout();
        setSession(null);
        setKeyPersistenceError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof ForgetKeyError) {
          setKeyPersistenceError(error);
          return;
        }

        throw error;
      });
  }

  function dismissKeyPersistenceError(): void {
    setKeyPersistenceError(null);
  }

  return {
    session,
    keyPersistenceError,
    dismissKeyPersistenceError,
    login,
    logout
  };
}
