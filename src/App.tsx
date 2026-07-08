import type { JSX } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';
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

type LabelResult = {
  pin: string;
  label: string;
};

type LabelFlowState = {
  route: 'label';
  initialLabel: string;
  origin: 'manual' | 'vault';
  labelVersion: number;
};

type RevealFlowState = {
  route: 'reveal';
  result: LabelResult;
  origin: 'manual' | 'vault';
  labelVersion: number;
};

type PrimaryFlowState = LabelFlowState | RevealFlowState;

type VaultFlowState = {
  route: 'vault';
  returnState: PrimaryFlowState;
};

type FlowState = PrimaryFlowState | VaultFlowState;

type FlowAction =
  | { type: 'openVault' }
  | { type: 'closeVault' }
  | { type: 'selectVaultLabel'; label: SavedLabel }
  | { type: 'showReveal'; pin: string; label: string }
  | { type: 'exitReveal' }
  | { type: 'reset' };

const initialFlowState: FlowState = {
  route: 'label',
  initialLabel: '',
  origin: 'manual',
  labelVersion: 0
};

function labelCameFromVault(state: FlowState, label: string): boolean {
  if (state.route !== 'label') {
    return false;
  }

  return (
    state.origin === 'vault' &&
    state.initialLabel !== '' &&
    normalizeLabel(label) === normalizeLabel(state.initialLabel)
  );
}

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'openVault':
      if (state.route === 'vault') {
        return state;
      }

      return {
        route: 'vault',
        returnState: state
      };

    case 'closeVault':
      if (state.route !== 'vault') {
        return state;
      }

      return state.returnState;

    case 'selectVaultLabel':
      return {
        route: 'label',
        initialLabel: action.label.originalLabel,
        origin: 'vault',
        labelVersion:
          state.route === 'vault'
            ? state.returnState.labelVersion + 1
            : state.labelVersion + 1
      };

    case 'showReveal':
      if (state.route !== 'label') {
        return state;
      }

      return {
        route: 'reveal',
        result: { pin: action.pin, label: action.label },
        origin: labelCameFromVault(state, action.label) ? 'vault' : 'manual',
        labelVersion: state.labelVersion
      };

    case 'exitReveal':
      if (state.route !== 'reveal') {
        return state;
      }

      return {
        route: 'label',
        initialLabel: '',
        origin: 'manual',
        labelVersion: state.labelVersion
      };

    case 'reset':
      return initialFlowState;
  }
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
  const [flow, dispatchFlow] = useReducer(flowReducer, initialFlowState);

  const vault = useVaultController();
  const initializeVaultStatus = vault.initializeStatus;

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
    dispatchFlow({ type: 'reset' });
    vault.reset();

    if (activeSession.outcome === 'in-memory') {
      setSession(null);
      setKeyPersistenceError(null);
      return;
    }

    Promise.all([forgetMasterKey(), forgetVault()])
      .then(() => {
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

  function toggleTheme(): void {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  function handleSelectLabel(label: SavedLabel): void {
    dispatchFlow({ type: 'selectVaultLabel', label });
    vault.clearSavedState();
  }

  function handleLabelProceed(pin: string, label: string): void {
    const shouldSaveUnlockedLabel = labelCameFromVault(flow, label);
    dispatchFlow({ type: 'showReveal', pin, label });
    vault.clearSavedState();
    if (shouldSaveUnlockedLabel) {
      void vault.saveUnlockedLabel(label, pin.length);
    }
  }

  async function handleSaveToVault(): Promise<void> {
    if (flow.route !== 'reveal') {
      return;
    }
    await vault.saveLabel(flow.result.label, flow.result.pin.length);
  }

  const isPersisted = session?.outcome === 'persisted';
  const vaultEnrolled =
    vault.status === 'locked' || vault.status === 'unlocked';
  const showSaveToVault =
    isPersisted &&
    vaultEnrolled &&
    flow.route === 'reveal' &&
    flow.origin !== 'vault' &&
    !vault.isSaved;

  // autoSaveNote: label came from vault, already saved — show confirmation in LabelScreen
  const autoSaveNote =
    isPersisted && flow.route === 'label' && flow.origin === 'vault';

  function screen(): JSX.Element {
    if (session === undefined) {
      return <Splash />;
    }

    if (session === null) {
      return <LoginScreen onConfirm={handleLoginConfirm} />;
    }

    if (flow.route === 'vault') {
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
          onExit={() => dispatchFlow({ type: 'closeVault' })}
        />
      );
    }

    if (flow.route === 'label') {
      return (
        <LabelScreen
          key={flow.labelVersion}
          masterKey={session.key}
          initialLabel={flow.initialLabel}
          sessionOutcome={session.outcome}
          vaultStatus={vault.status}
          autoSaveNote={autoSaveNote}
          onProceed={handleLabelProceed}
          onOpenVault={() => dispatchFlow({ type: 'openVault' })}
        />
      );
    }

    return (
      <RevealScreen
        pin={flow.result.pin}
        label={flow.result.label}
        revealTime={revealTime}
        showSaveToVault={showSaveToVault}
        isSaveToVaultBusy={vault.isSaveBusy}
        isSavedToVault={vault.isSaved}
        onExit={() => dispatchFlow({ type: 'exitReveal' })}
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
                dispatchFlow({ type: 'openVault' });
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
