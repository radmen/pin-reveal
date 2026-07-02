import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  KeyPersistenceWarningBanner,
  type KeyPersistenceError
} from './components/KeyPersistenceWarningBanner';
import { MenuDrawer } from './components/MenuDrawer';
import { Splash } from './components/Splash';
import { Topbar } from './components/Topbar';
import { UpdateReadyBanner } from './components/UpdateReadyBanner';
import {
  ForgetKeyError,
  forgetMasterKey,
  LoadKeyError,
  loadMasterKey,
  StoreKeyError,
  storeMasterKey
} from './key-persistence';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import { type ApplyAppUpdate, subscribeToAppUpdate } from './pwa-update';
import styles from './App.module.css';

type Theme = 'dark' | 'light';
type SessionOutcome = 'persisted' | 'in-memory';

type UnlockedSession = {
  key: CryptoKey;
  outcome: SessionOutcome;
};

function findStoredTheme(): Theme | null {
  try {
    const savedTheme = localStorage.getItem('pinderive.theme');

    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }

    return null;
  } catch {
    return null;
  }
}

function storeThemePreference(theme: Theme): void {
  try {
    localStorage.setItem('pinderive.theme', theme);
  } catch {
    return;
  }
}

export function App(): JSX.Element {
  // ponytail: undefined = IDB loading (Splash); null = no key (LoginScreen).
  // jsdom has no indexedDB, so skip Splash in tests by initialising to null.
  const [session, setSession] = useState<UnlockedSession | null | undefined>(
    typeof indexedDB === 'undefined' ? null : undefined
  );
  const [theme, setTheme] = useState<Theme>(() => findStoredTheme() ?? 'dark');
  const [revealTime, setRevealTime] = useState(250);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyPersistenceError, setKeyPersistenceError] =
    useState<KeyPersistenceError | null>(null);
  const [applyAppUpdate, setApplyAppUpdate] = useState<ApplyAppUpdate | null>(
    null
  );
  const [labelResult, setLabelResult] = useState<{
    pin: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    let applyUpdate: ApplyAppUpdate = () => {};
    applyUpdate = subscribeToAppUpdate((): void => {
      setApplyAppUpdate(() => applyUpdate);
    });

    if (typeof indexedDB === 'undefined') {
      return;
    }

    void loadMasterKey()
      .then((loadedKey) => {
        setSession(loadedKey ? { key: loadedKey, outcome: 'persisted' } : null);
      })
      .catch((error: unknown) => {
        if (error instanceof LoadKeyError) {
          setKeyPersistenceError(error);
          setSession(null);
          return;
        }

        throw error;
      });
  }, []);

  async function handleLoginConfirm(confirmedKey: CryptoKey): Promise<void> {
    try {
      await storeMasterKey(confirmedKey);
      setSession({ key: confirmedKey, outcome: 'persisted' });
    } catch (error: unknown) {
      if (error instanceof StoreKeyError) {
        setKeyPersistenceError(error);
        setSession({ key: confirmedKey, outcome: 'in-memory' });
        return;
      }

      throw error;
    }
  }

  function handleLogout(): void {
    const activeSession = session;

    if (!activeSession) {
      return;
    }

    setMenuOpen(false);

    if (activeSession.outcome === 'in-memory') {
      setSession(null);
      setLabelResult(null);
      setKeyPersistenceError(null);
      return;
    }

    forgetMasterKey()
      .then(() => {
        setSession(null);
        setLabelResult(null);
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

  function toggleTheme(): void {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  function screen(): JSX.Element {
    if (session === undefined) {
      return <Splash />;
    }

    if (session === null) {
      return <LoginScreen onConfirm={handleLoginConfirm} />;
    }

    if (!labelResult) {
      return (
        <LabelScreen
          masterKey={session.key}
          onProceed={(pin, label) => setLabelResult({ pin, label })}
        />
      );
    }
    return (
      <RevealScreen
        pin={labelResult.pin}
        label={labelResult.label}
        revealTime={revealTime}
        onExit={() => setLabelResult(null)}
      />
    );
  }

  return (
    <div className={styles.appShell} data-theme={theme}>
      <div className={styles.phoneFrame}>
        <div className={styles.appSurface}>
          <Topbar
            theme={theme}
            onToggleTheme={toggleTheme}
            showMenu={!!session}
            sessionOutcome={session?.outcome ?? null}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <UpdateReadyBanner applyUpdate={applyAppUpdate} />
          <KeyPersistenceWarningBanner
            error={keyPersistenceError}
            onDismiss={() => setKeyPersistenceError(null)}
          />
          <div className={styles.screenSlot}>{screen()}</div>
          {menuOpen && (
            <MenuDrawer
              revealTime={revealTime}
              onChangeRevealTime={setRevealTime}
              onLogout={handleLogout}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
