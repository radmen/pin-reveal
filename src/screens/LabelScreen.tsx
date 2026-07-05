import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { CapLabel } from '../components/CapLabel';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenForm, ScreenHeader } from '../components/ScreenForm';
import { Skeleton } from '../components/Skeleton';
import {
  calculateLabelFingerprint,
  derivePin,
  normalizeLabel
} from '../derivation-contract';
import type { VaultStatus } from './VaultScreen';
import styles from './LabelScreen.module.css';

type LabelState =
  | { kind: 'idle' }
  | { kind: 'deriving'; runId: symbol }
  | { kind: 'verified'; pin: string; fingerprint: string };

type LabelAction =
  | { type: 'start'; runId: symbol }
  | { type: 'complete'; runId: symbol; pin: string; fingerprint: string }
  | { type: 'reset' };

function labelReducer(state: LabelState, action: LabelAction): LabelState {
  switch (action.type) {
    case 'start':
      return { kind: 'deriving', runId: action.runId };
    case 'complete':
      if (state.kind !== 'deriving' || state.runId !== action.runId) {
        return state;
      }
      return {
        kind: 'verified',
        pin: action.pin,
        fingerprint: action.fingerprint
      };
    case 'reset':
      return { kind: 'idle' };
  }
}

interface LabelScreenProps {
  masterKey: CryptoKey;
  initialLabel?: string;
  sessionOutcome: 'persisted' | 'in-memory';
  vaultStatus: VaultStatus;
  autoSaveNote: boolean;
  onProceed(pin: string, label: string): void;
  onOpenVault(): void;
}

async function getLabelResult(
  masterKey: CryptoKey,
  label: string,
  length: number
): Promise<{ pin: string; fingerprint: string }> {
  const [fingerprint, pin] = await Promise.all([
    calculateLabelFingerprint(masterKey, label),
    derivePin(masterKey, label, length)
  ]);
  return { pin, fingerprint };
}

export function LabelScreen({
  masterKey,
  initialLabel = '',
  sessionOutcome,
  vaultStatus,
  autoSaveNote,
  onProceed,
  onOpenVault
}: LabelScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(labelReducer, { kind: 'idle' });
  const [label, setLabel] = useState(initialLabel);
  const [length, setLength] = useState(4);
  const [customMode, setCustomMode] = useState(false);
  const [customLen, setCustomLen] = useState(5);

  const isVerified = state.kind === 'verified';
  const isBusy = state.kind === 'deriving';
  const labelInvalid =
    !label.trim() || (customMode && (customLen < 3 || customLen > 12));
  const disabled = isBusy || (!isVerified && labelInvalid);

  function resetIfNotIdle(): void {
    if (state.kind !== 'idle') {
      dispatch({ type: 'reset' });
    }
  }

  async function generate(): Promise<void> {
    const resolvedLength = customMode
      ? Math.max(3, Math.min(12, customLen || 0))
      : length;
    const runId = Symbol();
    dispatch({ type: 'start', runId });
    const { pin, fingerprint } = await getLabelResult(
      masterKey,
      label,
      resolvedLength
    );
    dispatch({ type: 'complete', runId, pin, fingerprint });
  }

  return (
    <ScreenForm
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) {
          return;
        }
        if (isVerified) {
          onProceed(state.pin, label);
          return;
        }

        void generate();
      }}
    >
      <div className={styles.screenHeader}>
        <ScreenHeader
          eyebrow={<CapLabel>Step 02 · Derive a PIN</CapLabel>}
          title="New PIN"
        />
        {sessionOutcome === 'persisted' && (
          <button
            type="button"
            onClick={onOpenVault}
            className={styles.vaultButton}
          >
            <span className={styles.vaultDot} data-status={vaultStatus} />
            Vault
          </button>
        )}
      </div>

      <div className={styles.fields}>
        <div className={styles.fieldGroup}>
          <CapLabel>Label</CapLabel>
          <input
            value={label}
            onInput={(event) => {
              setLabel((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="e.g. visa, front-door"
            autocomplete="off"
            spellcheck={false}
            className={styles.field}
          />
          {normalizeLabel(label) && (
            <span className={styles.normalizedLabel}>
              → {normalizeLabel(label)}
            </span>
          )}
        </div>

        <div className={`${styles.fieldGroup} ${styles.fieldGroupSpacious}`}>
          <CapLabel>PIN length</CapLabel>
          <div className={styles.optionRow}>
            {([4, 6, 8] as const).map((digits) => (
              <button
                type="button"
                key={digits}
                onClick={() => {
                  setLength(digits);
                  setCustomMode(false);
                  resetIfNotIdle();
                }}
                aria-pressed={!customMode && length === digits}
                className={styles.optionButton}
              >
                {digits}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                resetIfNotIdle();
              }}
              aria-pressed={customMode}
              className={styles.optionButton}
            >
              ···
            </button>
          </div>
          {customMode && (
            <div className={styles.customRow}>
              <input
                type="number"
                min="3"
                max="12"
                value={customLen}
                onInput={(event) => {
                  setCustomLen(
                    parseInt((event.target as HTMLInputElement).value) || 0
                  );
                  resetIfNotIdle();
                }}
                className={styles.customInput}
              />
              <span className={styles.customCaption}>digits (3–12)</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.fingerprintPanel}>
        <CapLabel>Label fingerprint</CapLabel>
        {isBusy && (
          <div className={styles.skeletonRow}>
            <Skeleton width="108px" height="30px" />
            <Skeleton width="88px" height="30px" />
          </div>
        )}
        {isVerified && (
          <div className={styles.result}>
            <div className={styles.fingerprint}>{state.fingerprint}</div>
            <div className={styles.hint}>PIN ready — proceed to reveal it.</div>
            {autoSaveNote && (
              <div className={styles.savedNote}>✓ Saved to Vault</div>
            )}
          </div>
        )}
        {state.kind === 'idle' && (
          <div className={styles.placeholder}>•••• ••••</div>
        )}
      </div>

      <div className={styles.actions}>
        {isVerified && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
            className={styles.secondaryButton}
          >
            Reset
          </button>
        )}
        <PrimaryButton type="submit" disabled={disabled}>
          {isBusy ? 'Generating…' : isVerified ? 'Proceed →' : 'Generate PIN'}
        </PrimaryButton>
      </div>
    </ScreenForm>
  );
}
