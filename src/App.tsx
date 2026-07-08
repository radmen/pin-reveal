import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { KeyPersistenceWarningBanner } from './components/KeyPersistenceWarningBanner';
import { MenuDrawer } from './components/MenuDrawer';
import { Splash } from './components/Splash';
import { Topbar } from './components/Topbar';
import { UpdateReadyBanner } from './components/UpdateReadyBanner';
import { type SavedLabel } from './vault-persistence';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import { VaultScreen } from './screens/VaultScreen';
import { normalizeLabel } from './derivation-contract';
import { useAppUpdate } from './useAppUpdate';
import { usePersistentSession } from './usePersistentSession';
import { useThemePreference } from './useThemePreference';
import { useVaultController } from './useVaultController';
import styles from './App.module.css';

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

export function App(): JSX.Element {
  const { theme, toggleTheme } = useThemePreference();
  const [revealTime, setRevealTime] = useState(250);
  const [menuOpen, setMenuOpen] = useState(false);
  const applyAppUpdate = useAppUpdate();
  const [flow, dispatchFlow] = useReducer(flowReducer, initialFlowState);

  const vault = useVaultController();
  const initializeVaultStatus = vault.initializeStatus;
  const {
    session,
    keyPersistenceError,
    dismissKeyPersistenceError,
    login,
    logout
  } = usePersistentSession(initializeVaultStatus, () => {
    dispatchFlow({ type: 'reset' });
    vault.reset();
  });

  function handleLogout(): void {
    setMenuOpen(false);
    logout();
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
      return <LoginScreen onConfirm={login} />;
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
            onDismiss={dismissKeyPersistenceError}
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
