import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PrimaryButton } from '../components/PrimaryButton';
import type { VaultPasskeyDiagnosticEvent } from '../vault-passkey.adapter';
import type { VaultStatus } from './VaultScreen';
import styles from './VaultScreen.module.css';

type VaultDiagnosticCopyStatus = 'idle' | 'copied' | 'failed';

type VaultDiagnosticItem = {
  label: string;
  value: string;
};

interface VaultInspectorScreenProps {
  status: VaultStatus;
  isBusy: boolean;
  events: VaultPasskeyDiagnosticEvent[];
  runLabel: string;
  onRunDiagnostics?: () => void;
  onBack(): void;
}

function getRuntimeDetails(): Record<string, unknown> {
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

function createDiagnosticItems(
  status: VaultStatus,
  events: VaultPasskeyDiagnosticEvent[]
): VaultDiagnosticItem[] {
  const runtimeDetails = getRuntimeDetails();

  return [
    { label: 'App mode', value: formatDiagnosticValue(runtimeDetails.appMode) },
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
    { label: 'Vault status', value: status },
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

function createDiagnosticReport(
  status: VaultStatus,
  events: VaultPasskeyDiagnosticEvent[]
): string {
  return JSON.stringify(
    {
      runtime: getRuntimeDetails(),
      vaultStatus: status,
      events
    },
    null,
    2
  );
}

export function VaultInspectorScreen({
  status,
  isBusy,
  events,
  runLabel,
  onRunDiagnostics,
  onBack
}: VaultInspectorScreenProps): JSX.Element {
  const [copyStatus, setCopyStatus] =
    useState<VaultDiagnosticCopyStatus>('idle');
  const diagnosticItems = createDiagnosticItems(status, events);
  const diagnosticReport = createDiagnosticReport(status, events);

  useEffect(() => {
    setCopyStatus('idle');
  }, [diagnosticReport]);

  async function handleCopyDiagnostics(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(diagnosticReport);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button type="button" onClick={onBack} className={styles.backButton}>
          ←
        </button>
        <span className={styles.vaultTitle}>Diagnostics</span>
        <span className={styles.headerSpacer} />
      </div>

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
          {isBusy ? 'Running diagnostics…' : runLabel}
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
            onClick={handleCopyDiagnostics}
          >
            Copy report
          </button>
          {copyStatus === 'copied' && (
            <span className={styles.copyStatus}>Copied.</span>
          )}
          {copyStatus === 'failed' && (
            <span className={styles.copyStatus}>Copy failed.</span>
          )}
        </div>

        <details className={styles.rawReport}>
          <summary>Raw report</summary>
          <pre>{diagnosticReport}</pre>
        </details>
      </div>
    </div>
  );
}
