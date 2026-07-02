import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { CapLabel } from '../components/CapLabel';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenForm, ScreenHeader } from '../components/ScreenForm';
import { Skeleton } from '../components/Skeleton';
import { deriveKey } from '../derive-key.adapter';
import { calculateLoginFingerprint } from '../derivation-contract';
import styles from './LoginScreen.module.css';

type LoginState =
  | { kind: 'idle'; derivationError?: string }
  | { kind: 'deriving'; runId: symbol }
  | { kind: 'verified'; key: CryptoKey; fingerprint: string };

type LoginAction =
  | { type: 'start'; runId: symbol }
  | { type: 'complete'; runId: symbol; key: CryptoKey; fingerprint: string }
  | { type: 'fail'; runId: symbol }
  | { type: 'reset' };

const genericDerivationError =
  'We could not derive your key. Check your credentials and try again.';

function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case 'start':
      return { kind: 'deriving', runId: action.runId };
    case 'complete':
      if (state.kind !== 'deriving' || state.runId !== action.runId) {
        return state;
      }
      return {
        kind: 'verified',
        key: action.key,
        fingerprint: action.fingerprint
      };
    case 'fail':
      if (state.kind !== 'deriving' || state.runId !== action.runId) {
        return state;
      }
      return { kind: 'idle', derivationError: genericDerivationError };
    case 'reset':
      return { kind: 'idle' };
  }
}

interface LoginScreenProps {
  onConfirm(key: CryptoKey): Promise<void>;
}

export function LoginScreen({ onConfirm }: LoginScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(loginReducer, { kind: 'idle' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const isVerified = state.kind === 'verified';
  const isDeriving = state.kind === 'deriving';
  const disabled =
    isDeriving || isConfirming || (!isVerified && !(username && password));

  async function generate(): Promise<void> {
    const runId = Symbol();
    dispatch({ type: 'start', runId });
    let derivedKey: CryptoKey;

    try {
      derivedKey = await deriveKey(password, username);
    } catch {
      dispatch({ type: 'fail', runId });
      return;
    }

    const fingerprint = await calculateLoginFingerprint(derivedKey);
    dispatch({ type: 'complete', runId, key: derivedKey, fingerprint });
  }

  function resetIfNotIdle(): void {
    if (state.kind !== 'idle' && !isConfirming) {
      dispatch({ type: 'reset' });
    }
  }

  async function confirmLogin(key: CryptoKey): Promise<void> {
    setIsConfirming(true);
    try {
      await onConfirm(key);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <ScreenForm
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) {
          return;
        }
        if (isVerified) {
          void confirmLogin(state.key);
          return;
        }

        void generate();
      }}
    >
      <ScreenHeader
        eyebrow={<CapLabel>Step 01 · Credentials</CapLabel>}
        title="Derive your key"
        intro={
          <>
            Nothing is stored or checked. The fingerprint is your only signal
            that the pair is right.
          </>
        }
      />

      <div className={styles.fields}>
        <div className={styles.fieldGroup}>
          <CapLabel>Username</CapLabel>
          <input
            value={username}
            onInput={(event) => {
              setUsername((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="identity"
            autocomplete="off"
            spellcheck={false}
            className={styles.field}
          />
        </div>
        <div className={styles.fieldGroup}>
          <CapLabel>Password</CapLabel>
          <input
            type="password"
            value={password}
            onInput={(event) => {
              setPassword((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="passphrase"
            autocomplete="off"
            className={styles.field}
          />
        </div>
      </div>

      <div className={styles.fingerprintPanel}>
        <CapLabel>Login fingerprint</CapLabel>
        {isDeriving && (
          <div className={styles.skeletonRow}>
            <Skeleton width="120px" height="32px" />
            <Skeleton width="96px" height="32px" />
          </div>
        )}
        {isVerified && (
          <div className={styles.result}>
            <div className={styles.fingerprint}>{state.fingerprint}</div>
            <div className={styles.hint}>
              Recognize these two words? Then proceed.
            </div>
          </div>
        )}
        {state.kind === 'idle' && (
          <>
            {state.derivationError && (
              <div role="alert" className={styles.error}>
                {state.derivationError}
              </div>
            )}
            <div className={styles.placeholder}>•••• ••••</div>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <PrimaryButton type="submit" disabled={disabled}>
          {isConfirming ? (
            'Logging in...'
          ) : isDeriving ? (
            <span className={styles.buttonContent}>
              <span className={styles.spinner} />
              Deriving…
            </span>
          ) : isVerified ? (
            'Proceed →'
          ) : (
            'Generate fingerprint'
          )}
        </PrimaryButton>
      </div>
    </ScreenForm>
  );
}
