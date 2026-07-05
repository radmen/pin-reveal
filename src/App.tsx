import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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
import {
  checkPrfSupport,
  createVaultPasskey,
  getVaultPrfOutput,
  VaultPasskeyNotSupportedError
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
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import { VaultScreen, type VaultStatus } from './screens/VaultScreen';
import { normalizeLabel } from './derivation-contract';
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

  // vault
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>('unavailable');
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [savedLabels, setSavedLabels] = useState<string[]>([]);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [selectedFromVault, setSelectedFromVault] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const [labelScreenKey, setLabelScreenKey] = useState(0);
  const [vaultSaved, setVaultSaved] = useState(false);
  const [vaultSaveBusy, setVaultSaveBusy] = useState(false);

  const vaultKeyRef = useRef<CryptoKey | null>(null);
  const savedLabelsRef = useRef<string[]>([]);
  const vaultStatusRef = useRef<VaultStatus>('unavailable');
  const isRemovingLabelRef = useRef(false);

  vaultKeyRef.current = vaultKey;
  savedLabelsRef.current = savedLabels;
  vaultStatusRef.current = vaultStatus;

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
  }, []);

  async function initializeVaultStatus(): Promise<void> {
    try {
      const supported = await checkPrfSupport();
      if (!supported) {
        setVaultStatus('unavailable');
        return;
      }
      const credential = await loadVaultCredential();
      setVaultStatus(credential ? 'locked' : 'unenrolled');
    } catch {
      setVaultStatus('unavailable');
    }
  }

  async function performVaultUnlock(): Promise<{
    key: CryptoKey;
    labels: string[];
  }> {
    const credential = await loadVaultCredential();
    if (!credential) {
      throw new Error('No vault credential found.');
    }
    const prfOutput = await getVaultPrfOutput(
      credential.credentialId,
      credential.prfSalt
    );
    const key = await deriveVaultKey(prfOutput, credential.prfSalt);
    const data = await loadVaultData();
    const labels = data ? await decryptLabels(key, data) : [];
    return { key, labels };
  }

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
    resetVaultState();

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

  function resetVaultState(): void {
    setVaultKey(null);
    setSavedLabels([]);
    setVaultStatus('unavailable');
    setShowVault(false);
    setSelectedFromVault(false);
    setPendingLabel('');
    setVaultSaved(false);
    setVaultSaveBusy(false);
    setVaultBusy(false);
  }

  function toggleTheme(): void {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  async function handleEnableVault(): Promise<void> {
    setVaultBusy(true);
    try {
      const { credentialId, prfSalt, prfOutput } = await createVaultPasskey();
      const key = await deriveVaultKey(prfOutput, prfSalt);
      const data = await encryptLabels(key, []);
      try {
        await storeVaultCredential({ credentialId, prfSalt });
        await storeVaultData(data);
      } catch (storageError: unknown) {
        // Best-effort cleanup to avoid orphaned WebAuthn credential in IDB
        await forgetVault().catch(() => {});
        throw storageError;
      }
      setVaultKey(key);
      setSavedLabels([]);
      setVaultStatus('unlocked');
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setVaultStatus('unavailable');
      }
      // VaultPasskeyCancelledError: user cancelled, stay in current state
      // VaultPersistenceError: IDB cleaned up, stay unenrolled
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleUnlockVault(): Promise<void> {
    setVaultBusy(true);
    try {
      const { key, labels } = await performVaultUnlock();
      setVaultKey(key);
      setSavedLabels(labels);
      setVaultStatus('unlocked');
    } catch {
      // cancelled or failed: stay locked
    } finally {
      setVaultBusy(false);
    }
  }

  function handleLockVault(): void {
    setVaultKey(null);
    setSavedLabels([]);
    setVaultStatus('locked');
  }

  async function handleDisableVault(): Promise<void> {
    try {
      await forgetVault();
      setVaultKey(null);
      setSavedLabels([]);
      setVaultStatus('unenrolled');
      // stay on vault screen so user sees the unenrolled state
    } catch {
      // IDB failure: stay in current state, user can retry
    }
  }

  function handleSelectLabel(label: string): void {
    setPendingLabel(label);
    setLabelScreenKey((k) => k + 1);
    setSelectedFromVault(true);
    setShowVault(false);
    setLabelResult(null);
    setVaultSaved(false);
  }

  async function handleRemoveLabel(label: string): Promise<void> {
    if (isRemovingLabelRef.current) {
      return;
    }
    const key = vaultKeyRef.current;
    if (!key || vaultStatusRef.current !== 'unlocked') {
      return;
    }
    isRemovingLabelRef.current = true;
    try {
      const updated = savedLabelsRef.current.filter(
        (savedLabel) => savedLabel !== label
      );
      const data = await encryptLabels(key, updated);
      await storeVaultData(data);
      setSavedLabels(updated);
    } catch {
      // crypto or IDB failure: leave state unchanged
    } finally {
      isRemovingLabelRef.current = false;
    }
  }

  function handleLabelProceed(pin: string, label: string): void {
    const isFromVault =
      selectedFromVault &&
      pendingLabel !== '' &&
      normalizeLabel(label) === normalizeLabel(pendingLabel);
    setSelectedFromVault(isFromVault);
    setPendingLabel('');
    setLabelResult({ pin, label });
    setVaultSaved(false);
    if (isFromVault) {
      handleLockVault();
    }
  }

  async function handleSaveToVault(): Promise<void> {
    if (!labelResult) {
      return;
    }
    const currentStatus = vaultStatusRef.current;
    if (currentStatus !== 'locked' && currentStatus !== 'unlocked') {
      return;
    }

    setVaultSaveBusy(true);
    try {
      let key: CryptoKey;
      let labels: string[];

      if (currentStatus === 'locked' || !vaultKeyRef.current) {
        const unlocked = await performVaultUnlock();
        key = unlocked.key;
        labels = unlocked.labels;
      } else {
        key = vaultKeyRef.current;
        labels = savedLabelsRef.current;
      }

      const normalizedLabel = normalizeLabel(labelResult.label);
      if (normalizedLabel) {
        // Recency ordering: most recently saved first; dedup by removing any existing entry
        const updated = [
          normalizedLabel,
          ...labels.filter((savedLabel) => savedLabel !== normalizedLabel)
        ];
        const data = await encryptLabels(key, updated);
        await storeVaultData(data);
        // lock after save per ADR 0004
        setVaultKey(null);
        setSavedLabels([]);
        setVaultStatus('locked');
        setVaultSaved(true);
      }
    } catch {
      // cancelled or failed
    } finally {
      setVaultSaveBusy(false);
    }
  }

  const isPersisted = session?.outcome === 'persisted';
  const vaultEnrolled = vaultStatus === 'locked' || vaultStatus === 'unlocked';
  const showSaveToVault =
    isPersisted && vaultEnrolled && !selectedFromVault && !vaultSaved;

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
          status={vaultStatus}
          isBusy={vaultBusy}
          savedLabels={savedLabels}
          onEnable={handleEnableVault}
          onUnlock={handleUnlockVault}
          onLock={handleLockVault}
          onDisable={handleDisableVault}
          onSelectLabel={handleSelectLabel}
          onRemoveLabel={handleRemoveLabel}
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
          vaultStatus={vaultStatus}
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
        isSaveToVaultBusy={vaultSaveBusy}
        isSavedToVault={vaultSaved}
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
              vaultStatus={vaultStatus}
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
