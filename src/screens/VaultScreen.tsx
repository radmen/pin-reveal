import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PrimaryButton } from '../components/PrimaryButton';
import type { SavedLabel } from '../vault-persistence';
import styles from './VaultScreen.module.css';

export type VaultStatus = 'unavailable' | 'unenrolled' | 'locked' | 'unlocked';
export type VaultDiagnosticItem = {
  label: string;
  value: string;
};

type VaultDiagnosticCopyStatus = 'idle' | 'copied' | 'failed';

interface VaultScreenProps {
  status: VaultStatus;
  isBusy: boolean;
  savedLabels: SavedLabel[];
  diagnosticsEnabled: boolean;
  diagnosticItems: VaultDiagnosticItem[];
  diagnosticReport: string | null;
  diagnosticCopyStatus: VaultDiagnosticCopyStatus;
  diagnosticRunLabel: string;
  onEnable(): void;
  onUnlock(): void;
  onLock(): void;
  onDisable(): void;
  onSelectLabel(label: SavedLabel): void;
  onRemoveLabel(label: SavedLabel): void;
  onCopyDiagnostics(): void;
  onRunDiagnostics?(): void;
  onExit(): void;
}

function VaultHeader({
  title,
  onBack,
  diagnosticsEnabled,
  onOpenDiagnostics
}: {
  title: string;
  onBack(): void;
  diagnosticsEnabled?: boolean;
  onOpenDiagnostics?: () => void;
}): JSX.Element {
  return (
    <div className={styles.header}>
      <button type="button" onClick={onBack} className={styles.backButton}>
        ←
      </button>
      <span className={styles.vaultTitle}>{title}</span>
      {diagnosticsEnabled && onOpenDiagnostics ? (
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className={styles.headerAction}
        >
          Diagnostics
        </button>
      ) : (
        <span className={styles.headerSpacer} />
      )}
    </div>
  );
}

function VaultDiagnosticsScreen({
  isBusy,
  diagnosticItems,
  diagnosticReport,
  diagnosticCopyStatus,
  diagnosticRunLabel,
  onRunDiagnostics,
  onCopyDiagnostics,
  onBack
}: {
  isBusy: boolean;
  diagnosticItems: VaultDiagnosticItem[];
  diagnosticReport: string | null;
  diagnosticCopyStatus: VaultDiagnosticCopyStatus;
  diagnosticRunLabel: string;
  onRunDiagnostics?: () => void;
  onCopyDiagnostics(): void;
  onBack(): void;
}): JSX.Element {
  return (
    <div className={styles.screen}>
      <VaultHeader title="Diagnostics" onBack={onBack} />

      <div className={styles.diagnosticsView}>
        <div className={styles.diagnosticsIntro}>
          <h2 className={styles.stateHeading}>Vault diagnostics</h2>
          <p className={styles.stateText}>
            This lists the browser, WebAuthn, passkey PRF, and Vault runtime
            details needed to troubleshoot mobile support. Buffer values are
            summarized by byte length, not printed as secrets.
          </p>
        </div>

        <PrimaryButton
          disabled={isBusy || !onRunDiagnostics}
          onClick={onRunDiagnostics}
        >
          {isBusy ? 'Running diagnostics…' : diagnosticRunLabel}
        </PrimaryButton>
        <span className={styles.diagnosticsHint}>
          This uses the real Vault enable or unlock flow. If enabling succeeds,
          the Vault stays enabled.
        </span>

        <div className={styles.diagnosticList}>
          {diagnosticItems.map((item) => (
            <div key={item.label} className={styles.diagnosticRow}>
              <span className={styles.diagnosticLabel}>{item.label}</span>
              <code className={styles.diagnosticValue}>{item.value}</code>
            </div>
          ))}
        </div>

        <div className={styles.diagnosticActions}>
          <button
            type="button"
            className={styles.copyButton}
            disabled={!diagnosticReport}
            onClick={onCopyDiagnostics}
          >
            Copy report
          </button>
          {diagnosticCopyStatus === 'copied' && (
            <span className={styles.copyStatus}>Copied.</span>
          )}
          {diagnosticCopyStatus === 'failed' && (
            <span className={styles.copyStatus}>Copy failed.</span>
          )}
        </div>

        <details className={styles.rawReport}>
          <summary>Raw report</summary>
          <pre>{diagnosticReport ?? 'Diagnostics are not available.'}</pre>
        </details>
      </div>
    </div>
  );
}

function FingerprintIcon({
  variant
}: {
  variant: 'unavailable' | 'off' | 'locked';
}): JSX.Element {
  const className =
    variant === 'unavailable'
      ? styles.iconUnavailable
      : variant === 'off'
        ? styles.iconOff
        : styles.iconLocked;
  const size = variant === 'locked' ? 56 : 52;

  return (
    <div className={className}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <path d="M12 3.4c-4 0-6.6 3-6.6 6.9v3.2" />
        <path d="M18.6 13.5v-3.2c0-1.7-.6-3.1-1.7-4.1" />
        <path d="M8.5 10.3c0-2 1.5-3.6 3.5-3.6s3.5 1.6 3.5 3.6v4c0 .8.2 1.6.5 2.3" />
        <path d="M11.5 10.3v4.6c0 1 .2 2 .6 2.9" />
        <path d="M8.6 13.6v1.2c0 1.4.4 2.8 1.1 3.9" />
        <path d="M5.8 16.9c.4 1 1 1.9 1.7 2.7" />
        {variant === 'unavailable' && (
          <path d="M4.5 4.5l15 15" stroke="var(--danger)" />
        )}
      </svg>
    </div>
  );
}

function LabelRow({
  label,
  onSelect,
  onRemove
}: {
  label: SavedLabel;
  onSelect(): void;
  onRemove(): void;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleRemoveClick(): void {
    if (armed) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      onRemove();
      return;
    }
    setArmed(true);
    timerRef.current = setTimeout(() => setArmed(false), 1000);
  }

  return (
    <div className={styles.labelRow}>
      <button type="button" onClick={onSelect} className={styles.labelName}>
        {label.originalLabel}
      </button>
      <button
        type="button"
        onClick={handleRemoveClick}
        data-armed={armed}
        className={styles.removeButton}
      >
        {armed ? 'Confirm' : 'Remove'}
      </button>
    </div>
  );
}

export function VaultScreen({
  status,
  isBusy,
  savedLabels,
  diagnosticsEnabled,
  diagnosticItems,
  diagnosticReport,
  diagnosticCopyStatus,
  diagnosticRunLabel,
  onEnable,
  onUnlock,
  onLock,
  onDisable,
  onSelectLabel,
  onRemoveLabel,
  onCopyDiagnostics,
  onRunDiagnostics,
  onExit
}: VaultScreenProps): JSX.Element {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (showDiagnostics) {
    return (
      <VaultDiagnosticsScreen
        isBusy={isBusy}
        diagnosticItems={diagnosticItems}
        diagnosticReport={diagnosticReport}
        diagnosticCopyStatus={diagnosticCopyStatus}
        diagnosticRunLabel={diagnosticRunLabel}
        onRunDiagnostics={onRunDiagnostics}
        onCopyDiagnostics={onCopyDiagnostics}
        onBack={() => setShowDiagnostics(false)}
      />
    );
  }

  return (
    <div className={styles.screen}>
      <VaultHeader
        title="Vault"
        onBack={onExit}
        diagnosticsEnabled={diagnosticsEnabled}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />

      {status === 'unavailable' && (
        <div className={styles.stateView}>
          <FingerprintIcon variant="unavailable" />
          <div className={styles.stateTextBlock}>
            <h2 className={styles.stateHeading}>Vault unavailable</h2>
            <p className={styles.stateText}>
              This browser or device may support biometric scans, but it didn't
              provide the passkey PRF output the Vault needs for encryption.
              There's no weaker fallback — Saved Labels stay off here.
            </p>
          </div>
          {diagnosticsEnabled && (
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className={styles.secondaryButton}
            >
              Open diagnostics
            </button>
          )}
        </div>
      )}

      {status === 'unenrolled' && (
        <div className={styles.stateView}>
          <FingerprintIcon variant="off" />
          <div className={styles.stateTextBlock}>
            <h2 className={styles.stateHeading}>Vault is off</h2>
            <p className={styles.stateText}>
              Turn on the Vault to keep Saved Labels on this device. A dedicated
              Vault Passkey encrypts them, separate from your master key —
              nothing is stored until you enable it.
            </p>
          </div>
          <PrimaryButton disabled={isBusy} onClick={onEnable}>
            {isBusy ? 'Creating Vault Passkey…' : 'Enable Vault'}
          </PrimaryButton>
        </div>
      )}

      {status === 'locked' && (
        <div className={styles.stateView}>
          <FingerprintIcon variant="locked" />
          <div className={styles.stateTextBlock}>
            <h2 className={styles.stateHeading}>Locked</h2>
            <p className={styles.stateText}>
              Vault Unlock is required to view Saved Labels.
            </p>
          </div>
          <PrimaryButton disabled={isBusy} onClick={onUnlock}>
            {isBusy ? 'Unlocking…' : 'Unlock Vault'}
          </PrimaryButton>
        </div>
      )}

      {status === 'unlocked' && (
        <div className={styles.listView}>
          {savedLabels.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyText}>No Saved Labels yet.</span>
              <span className={styles.emptyHint}>
                Save a label after you reveal its PIN to add it here.
              </span>
            </div>
          ) : (
            <>
              <div className={styles.labelList}>
                {savedLabels.map((label) => (
                  <LabelRow
                    key={`${label.normalizedLabel}:${label.pinLength}`}
                    label={label}
                    onSelect={() => onSelectLabel(label)}
                    onRemove={() => onRemoveLabel(label)}
                  />
                ))}
              </div>
              <span className={styles.listHint}>
                Tap a Saved Label to reuse it · tap Remove twice to delete
              </span>
            </>
          )}

          <div className={styles.bottomActions}>
            <button
              type="button"
              onClick={onLock}
              className={styles.lockButton}
            >
              Lock
            </button>
            <button
              type="button"
              onClick={onDisable}
              className={styles.disableButton}
            >
              Disable Vault
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
