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
  type VaultPasskeyDiagnosticEvent,
  type VaultPasskeyDiagnosticRecorder,
  VaultPasskeyCancelledError,
  VaultPasskeyError,
  VaultPasskeyNotSupportedError
} from './vault-passkey.adapter';
import {
  decryptLabels,
  deriveVaultKey,
  encryptLabels,
  forgetVault,
  loadVaultCredential,
  loadVaultData,
  type SavedLabel,
  storeVaultCredential,
  storeVaultData,
  VaultPersistenceError
} from './vault-persistence';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import {
  VaultScreen,
  type VaultDiagnosticItem,
  type VaultStatus
} from './screens/VaultScreen';
import { normalizeLabel } from './derivation-contract';
import { type ApplyAppUpdate, subscribeToAppUpdate } from './pwa-update';
import styles from './App.module.css';

type Theme = 'dark' | 'light';
type SessionOutcome = 'persisted' | 'in-memory';

type UnlockedSession = {
  key: CryptoKey;
  outcome: SessionOutcome;
};

const VAULT_UNLOCK_TIMEOUT_MS = 60_000;

function findVaultDiagnosticsEnabled(): boolean {
  if (import.meta.env.MODE !== 'production') {
    return true;
  }

  try {
    const searchParameters = new URLSearchParams(window.location.search);

    return (
      searchParameters.get('vault-debug') === '1' ||
      localStorage.getItem('pinderive.vaultDebug') === 'true'
    );
  } catch {
    return false;
  }
}

function getVaultDiagnosticRuntimeDetails(): Record<string, unknown> {
  return {
    appMode: import.meta.env.MODE,
    isSecureContext:
      typeof window !== 'undefined' ? window.isSecureContext : null,
    url: typeof window !== 'undefined' ? window.location.href : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    hasPublicKeyCredential:
      typeof window !== 'undefined' && !!window.PublicKeyCredential,
    hasCredentialCreate:
      typeof navigator !== 'undefined' && !!navigator.credentials?.create,
    hasCredentialGet:
      typeof navigator !== 'undefined' && !!navigator.credentials?.get,
    hasClipboardWrite:
      typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function findDiagnosticDetails(
  events: VaultPasskeyDiagnosticEvent[],
  step: string
): unknown {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].step === step) {
      return events[index].details;
    }
  }

  return null;
}

function findDiagnosticField(
  events: VaultPasskeyDiagnosticEvent[],
  step: string,
  field: string
): unknown {
  const details = findDiagnosticDetails(events, step);

  if (!isRecord(details)) {
    return null;
  }

  return details[field] ?? null;
}

function formatDiagnosticValue(value: unknown): string {
  if (value === null || typeof value === 'undefined') {
    return 'not collected yet';
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return JSON.stringify(value);
}

function createVaultDiagnosticItems(
  vaultStatus: VaultStatus,
  events: VaultPasskeyDiagnosticEvent[]
): VaultDiagnosticItem[] {
  const runtimeDetails = getVaultDiagnosticRuntimeDetails();

  return [
    {
      label: 'App mode',
      value: formatDiagnosticValue(runtimeDetails.appMode)
    },
    {
      label: 'Secure context',
      value: formatDiagnosticValue(runtimeDetails.isSecureContext)
    },
    {
      label: 'Current URL',
      value: formatDiagnosticValue(runtimeDetails.url)
    },
    {
      label: 'User agent',
      value: formatDiagnosticValue(runtimeDetails.userAgent)
    },
    {
      label: 'Vault status',
      value: vaultStatus
    },
    {
      label: 'PublicKeyCredential API',
      value: formatDiagnosticValue(runtimeDetails.hasPublicKeyCredential)
    },
    {
      label: 'Credential create API',
      value: formatDiagnosticValue(runtimeDetails.hasCredentialCreate)
    },
    {
      label: 'Credential get API',
      value: formatDiagnosticValue(runtimeDetails.hasCredentialGet)
    },
    {
      label: 'Client PRF capability',
      value: formatDiagnosticValue(
        findDiagnosticField(
          events,
          'support.client-capabilities',
          'extension:prf'
        )
      )
    },
    {
      label: 'Raw client capabilities',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'support.client-capabilities')
      )
    },
    {
      label: 'Platform authenticator available',
      value: formatDiagnosticValue(
        findDiagnosticField(
          events,
          'support.platform-authenticator',
          'available'
        )
      )
    },
    {
      label: 'Platform authenticator error',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'support.platform-authenticator-error')
      )
    },
    {
      label: 'Support check decision',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'support.result')
      )
    },
    {
      label: 'Create request options',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'create.request')
      )
    },
    {
      label: 'Create error',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'create.error')
      )
    },
    {
      label: 'Create extension results',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'create.extension-results')
      )
    },
    {
      label: 'Create decision',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'create.result')
      )
    },
    {
      label: 'Assertion request options',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'assertion.request')
      )
    },
    {
      label: 'Assertion error',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'assertion.error')
      )
    },
    {
      label: 'Assertion extension results',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'assertion.extension-results')
      )
    },
    {
      label: 'Assertion decision',
      value: formatDiagnosticValue(
        findDiagnosticDetails(events, 'assertion.result')
      )
    }
  ];
}

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
  const [savedLabels, setSavedLabels] = useState<SavedLabel[]>([]);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [selectedFromVault, setSelectedFromVault] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const [labelScreenKey, setLabelScreenKey] = useState(0);
  const [vaultSaved, setVaultSaved] = useState(false);
  const [vaultSaveBusy, setVaultSaveBusy] = useState(false);
  const [vaultDiagnosticsEnabled] = useState(findVaultDiagnosticsEnabled);
  const [vaultDiagnosticEvents, setVaultDiagnosticEvents] = useState<
    VaultPasskeyDiagnosticEvent[]
  >([]);
  const [vaultDiagnosticCopyStatus, setVaultDiagnosticCopyStatus] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');

  const vaultKeyRef = useRef<CryptoKey | null>(null);
  const savedLabelsRef = useRef<SavedLabel[]>([]);
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

  useEffect(() => {
    if (vaultStatus !== 'unlocked') {
      return;
    }

    const timer = setTimeout(() => {
      lockVault();
    }, VAULT_UNLOCK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [vaultStatus]);

  async function initializeVaultStatus(): Promise<void> {
    try {
      const supported = await checkPrfSupport(findVaultDiagnosticRecorder());
      if (!supported) {
        setVaultStatus('unavailable');
        return;
      }
      const credential = await loadVaultCredential();
      setVaultStatus(credential ? 'locked' : 'unenrolled');
    } catch (error: unknown) {
      if (
        error instanceof VaultPersistenceError ||
        error instanceof VaultPasskeyError
      ) {
        setVaultStatus('unavailable');
        return;
      }

      throw error;
    }
  }

  async function performVaultUnlock(): Promise<{
    key: CryptoKey;
    labels: SavedLabel[];
  }> {
    const credential = await loadVaultCredential();
    if (!credential) {
      throw new Error('No vault credential found.');
    }
    const prfOutput = await getVaultPrfOutput(
      credential.credentialId,
      credential.prfSalt,
      findVaultDiagnosticRecorder()
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
    setVaultDiagnosticEvents([]);
    setVaultDiagnosticCopyStatus('idle');
  }

  function recordVaultDiagnosticEvent(
    event: VaultPasskeyDiagnosticEvent
  ): void {
    setVaultDiagnosticEvents((events) => [...events, event].slice(-50));
    setVaultDiagnosticCopyStatus('idle');
  }

  function findVaultDiagnosticRecorder():
    VaultPasskeyDiagnosticRecorder | undefined {
    return vaultDiagnosticsEnabled ? recordVaultDiagnosticEvent : undefined;
  }

  function resetVaultDiagnostics(): void {
    if (!vaultDiagnosticsEnabled) {
      return;
    }

    setVaultDiagnosticEvents([]);
    setVaultDiagnosticCopyStatus('idle');
  }

  function lockVault(): void {
    setVaultKey(null);
    setSavedLabels([]);
    setVaultStatus('locked');
  }

  function updateSavedLabels(
    labels: SavedLabel[],
    label: string,
    pinLength: number
  ): SavedLabel[] {
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel) {
      return labels;
    }

    return [
      {
        originalLabel: label,
        normalizedLabel,
        pinLength,
        lastUsedAt: Date.now()
      },
      ...labels.filter(
        (savedLabel) => savedLabel.normalizedLabel !== normalizedLabel
      )
    ];
  }

  function toggleTheme(): void {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  async function handleEnableVault(): Promise<void> {
    resetVaultDiagnostics();
    setVaultBusy(true);
    try {
      const { credentialId, prfSalt, prfOutput } = await createVaultPasskey(
        findVaultDiagnosticRecorder()
      );
      const key = await deriveVaultKey(prfOutput, prfSalt);
      const data = await encryptLabels(key, []);
      try {
        await storeVaultCredential({ credentialId, prfSalt });
        await storeVaultData(data);
      } catch (storageError: unknown) {
        await forgetVault();
        throw storageError;
      }
      setVaultKey(null);
      setSavedLabels([]);
      setVaultStatus('locked');
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setVaultStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleUnlockVault(): Promise<void> {
    resetVaultDiagnostics();
    setVaultBusy(true);
    try {
      const { key, labels } = await performVaultUnlock();
      setVaultKey(key);
      setSavedLabels(labels);
      setVaultStatus('unlocked');
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setVaultStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setVaultBusy(false);
    }
  }

  function handleLockVault(): void {
    lockVault();
  }

  async function handleDisableVault(): Promise<void> {
    await forgetVault();
    setVaultKey(null);
    setSavedLabels([]);
    setVaultStatus('unenrolled');
    // stay on vault screen so user sees the unenrolled state
  }

  function handleSelectLabel(label: SavedLabel): void {
    setPendingLabel(label.originalLabel);
    setLabelScreenKey((k) => k + 1);
    setSelectedFromVault(true);
    setShowVault(false);
    setLabelResult(null);
    setVaultSaved(false);
  }

  async function handleRemoveLabel(label: SavedLabel): Promise<void> {
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
        (savedLabel) => savedLabel.normalizedLabel !== label.normalizedLabel
      );
      const data = await encryptLabels(key, updated);
      await storeVaultData(data);
      setSavedLabels(updated);
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
      void saveOrUpdateVaultLabel(label, pin.length, savedLabelsRef.current);
    }
  }

  async function saveOrUpdateVaultLabel(
    label: string,
    pinLength: number,
    labels: SavedLabel[]
  ): Promise<void> {
    const key = vaultKeyRef.current;
    if (!key || vaultStatusRef.current !== 'unlocked') {
      return;
    }

    const updated = updateSavedLabels(labels, label, pinLength);
    const data = await encryptLabels(key, updated);
    await storeVaultData(data);
    setVaultSaved(true);
    lockVault();
  }

  async function handleSaveToVault(): Promise<void> {
    if (!labelResult) {
      return;
    }
    const currentStatus = vaultStatusRef.current;
    if (currentStatus !== 'locked' && currentStatus !== 'unlocked') {
      return;
    }

    resetVaultDiagnostics();
    setVaultSaveBusy(true);
    try {
      let key: CryptoKey;
      let labels: SavedLabel[];

      if (currentStatus === 'locked' || !vaultKeyRef.current) {
        const unlocked = await performVaultUnlock();
        key = unlocked.key;
        labels = unlocked.labels;
      } else {
        key = vaultKeyRef.current;
        labels = savedLabelsRef.current;
      }

      const updated = updateSavedLabels(
        labels,
        labelResult.label,
        labelResult.pin.length
      );
      if (updated !== labels) {
        const data = await encryptLabels(key, updated);
        await storeVaultData(data);
        setVaultSaved(true);
        lockVault();
      }
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setVaultStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setVaultSaveBusy(false);
    }
  }

  const isPersisted = session?.outcome === 'persisted';
  const vaultEnrolled = vaultStatus === 'locked' || vaultStatus === 'unlocked';
  const showSaveToVault =
    isPersisted && vaultEnrolled && !selectedFromVault && !vaultSaved;

  const vaultDiagnosticReport = vaultDiagnosticsEnabled
    ? JSON.stringify(
        {
          runtime: getVaultDiagnosticRuntimeDetails(),
          vaultStatus,
          events: vaultDiagnosticEvents
        },
        null,
        2
      )
    : null;
  const vaultDiagnosticItems = vaultDiagnosticsEnabled
    ? createVaultDiagnosticItems(vaultStatus, vaultDiagnosticEvents)
    : [];
  const vaultDiagnosticRunLabel =
    vaultStatus === 'locked' || vaultStatus === 'unlocked'
      ? 'Run unlock check'
      : 'Try enabling Vault';
  const runVaultDiagnostics =
    vaultStatus === 'locked' || vaultStatus === 'unlocked'
      ? handleUnlockVault
      : handleEnableVault;

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
          diagnosticsEnabled={vaultDiagnosticsEnabled}
          diagnosticItems={vaultDiagnosticItems}
          diagnosticReport={vaultDiagnosticReport}
          diagnosticCopyStatus={vaultDiagnosticCopyStatus}
          diagnosticRunLabel={vaultDiagnosticRunLabel}
          onEnable={handleEnableVault}
          onUnlock={handleUnlockVault}
          onLock={handleLockVault}
          onDisable={handleDisableVault}
          onSelectLabel={handleSelectLabel}
          onRemoveLabel={handleRemoveLabel}
          onCopyDiagnostics={handleCopyVaultDiagnostics}
          onRunDiagnostics={
            vaultDiagnosticsEnabled ? runVaultDiagnostics : undefined
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

  async function handleCopyVaultDiagnostics(): Promise<void> {
    if (!vaultDiagnosticReport || !navigator.clipboard?.writeText) {
      setVaultDiagnosticCopyStatus('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(vaultDiagnosticReport);
      setVaultDiagnosticCopyStatus('copied');
    } catch {
      setVaultDiagnosticCopyStatus('failed');
    }
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
