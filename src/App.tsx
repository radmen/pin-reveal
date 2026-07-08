import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { KeyPersistenceWarningBanner } from './components/KeyPersistenceWarningBanner';
import { MenuDrawer } from './components/MenuDrawer';
import { Splash } from './components/Splash';
import { Topbar } from './components/Topbar';
import { UpdateReadyBanner } from './components/UpdateReadyBanner';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';
import { VaultScreen } from './screens/VaultScreen';
import { flowReducer, initialFlowState, labelCameFromVault } from './app-flow';
import { useAppUpdate } from './useAppUpdate';
import { usePersistentSession } from './usePersistentSession';
import { useThemePreference } from './useThemePreference';
import { useVaultController } from './useVaultController';
import type { SavedLabel } from './vault-types';
import styles from './App.module.css';

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
    const shouldSaveUnlockedLabel =
      labelCameFromVault(flow, label) && vault.status === 'unlocked';
    dispatchFlow({
      type: 'showReveal',
      pin,
      label,
      origin: shouldSaveUnlockedLabel ? 'vault' : 'manual'
    });
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
          initialPinLength={flow.initialPinLength}
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
