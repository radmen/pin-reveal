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
import { forgetVault, type SavedLabel } from './vault-persistence';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import { VaultScreen } from './screens/VaultScreen';
import { normalizeLabel } from './derivation-contract';
import { type ApplyAppUpdate, subscribeToAppUpdate } from './pwa-update';
import { useVaultController } from './useVaultController';
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

  const vault = useVaultController();
  const initializeVaultStatus = vault.initializeStatus;
  const [showVault, setShowVault] = useState(false);
  const [selectedFromVault, setSelectedFromVault] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const [labelScreenKey, setLabelScreenKey] = useState(0);

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

  async function handleLoginConfirm(confirmedKey: CryptoKey): Promise<void> {
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

  function handleLogout(): void {
    const activeSession = session;

    if (!activeSession) {
      return;
    }

    setMenuOpen(false);
    setShowVault(false);
    setSelectedFromVault(false);
    setPendingLabel('');
    vault.reset();

    if (activeSession.outcome === 'in-memory') {
      setSession(null);
      setLabelResult(null);
      setKeyPersistenceError(null);
      return;
    }

    Promise.all([forgetMasterKey(), forgetVault()])
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

  function handleSelectLabel(label: SavedLabel): void {
    setPendingLabel(label.originalLabel);
    setLabelScreenKey((k) => k + 1);
    setSelectedFromVault(true);
    setShowVault(false);
    setLabelResult(null);
    vault.clearSavedState();
  }

  function handleLabelProceed(pin: string, label: string): void {
    const isFromVault =
      selectedFromVault &&
      pendingLabel !== '' &&
      normalizeLabel(label) === normalizeLabel(pendingLabel);
    setSelectedFromVault(isFromVault);
    setPendingLabel('');
    setLabelResult({ pin, label });
    vault.clearSavedState();
    if (isFromVault) {
      void vault.saveUnlockedLabel(label, pin.length);
    }
  }

  async function handleSaveToVault(): Promise<void> {
    if (!labelResult) {
      return;
    }
    await vault.saveLabel(labelResult.label, labelResult.pin.length);
  }

  const isPersisted = session?.outcome === 'persisted';
  const vaultEnrolled =
    vault.status === 'locked' || vault.status === 'unlocked';
  const showSaveToVault =
    isPersisted && vaultEnrolled && !selectedFromVault && !vault.isSaved;

  // autoSaveNote: label came from vault, already saved — show confirmation in LabelScreen
  const autoSaveNote = isPersisted && selectedFromVault;

  function screen(): JSX.Element {
    if (session === undefined) {
      return <Splash />;
    }

    if (session === null) {
      return <LoginScreen onConfirm={handleLoginConfirm} />;
    }

    if (showVault) {
      return (
        <VaultScreen
          status={vault.status}
          isBusy={vault.isBusy}
          savedLabels={vault.savedLabels}
          diagnosticsEnabled={vault.diagnosticsEnabled}
          diagnosticEvents={vault.diagnosticEvents}
          diagnosticRunLabel={vault.diagnosticRunLabel}
          onEnable={vault.enable}
          onUnlock={vault.unlock}
          onLock={vault.lock}
          onDisable={vault.disable}
          onSelectLabel={handleSelectLabel}
          onRemoveLabel={vault.removeLabel}
          onRunDiagnostics={
            vault.diagnosticsEnabled ? vault.runDiagnostics : undefined
          }
          onExit={() => setShowVault(false)}
        />
      );
    }

    if (!labelResult) {
      return (
        <LabelScreen
          key={labelScreenKey}
          masterKey={session.key}
          initialLabel={pendingLabel}
          sessionOutcome={session.outcome}
          vaultStatus={vault.status}
          autoSaveNote={autoSaveNote}
          onProceed={handleLabelProceed}
          onOpenVault={() => setShowVault(true)}
        />
      );
    }

    return (
      <RevealScreen
        pin={labelResult.pin}
        label={labelResult.label}
        revealTime={revealTime}
        showSaveToVault={showSaveToVault}
        isSaveToVaultBusy={vault.isSaveBusy}
        isSavedToVault={vault.isSaved}
        onExit={() => {
          setLabelResult(null);
          setSelectedFromVault(false);
          setPendingLabel('');
        }}
        onSaveToVault={handleSaveToVault}
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
              sessionOutcome={session?.outcome ?? null}
              vaultStatus={vault.status}
              onChangeRevealTime={setRevealTime}
              onOpenVault={() => {
                setMenuOpen(false);
                setShowVault(true);
              }}
              onLogout={handleLogout}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
