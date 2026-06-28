import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { btnPrimary, capLabel } from '../components/styles';
import { loginFingerprint } from '../derive';

type LoginState =
  | { kind: 'idle' }
  | { kind: 'deriving'; runId: symbol }
  | { kind: 'verified'; key: CryptoKey; fingerprint: string };

type LoginAction =
  | { type: 'start'; runId: symbol }
  | { type: 'complete'; runId: symbol; key: CryptoKey; fingerprint: string }
  | { type: 'reset' };

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
    case 'reset':
      return { kind: 'idle' };
  }
}

interface LoginScreenProps {
  onConfirm(key: CryptoKey): void;
}

const fieldStyle: JSX.CSSProperties = {
  width: '100%',
  background: 'var(--field)',
  border: '1px solid var(--border)',
  borderRadius: '11px',
  padding: '14px',
  color: 'var(--fg)',
  fontFamily: "'Space Mono',monospace",
  fontSize: '15px',
  transition: 'border-color .15s,background .25s'
};

const skel = (width: string, height: string): JSX.CSSProperties => ({
  height,
  width,
  borderRadius: '8px',
  background: 'linear-gradient(90deg,var(--skel1),var(--skel2),var(--skel1))',
  backgroundSize: '400px 100%',
  animation: 'shimmer 1.3s linear infinite'
});

export function LoginScreen({ onConfirm }: LoginScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(loginReducer, { kind: 'idle' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const isVerified = state.kind === 'verified';
  const isDeriving = state.kind === 'deriving';
  const disabled = isDeriving || (!isVerified && !(username && password));

  async function generate() {
    if (!username || !password) return;
    const runId = Symbol();
    dispatch({ type: 'start', runId });
    const worker = new Worker(new URL('../derive.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.postMessage({ password, username });
    try {
      const derivedKey = await new Promise<CryptoKey>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<CryptoKey>) =>
          resolve(event.data);
        worker.onerror = (error) => {
          worker.terminate();
          reject(error);
        };
      });
      worker.terminate();
      const fingerprint = await loginFingerprint(derivedKey);
      dispatch({ type: 'complete', runId, key: derivedKey, fingerprint });
    } catch {
      dispatch({ type: 'reset' });
    }
  }

  function resetIfNotIdle() {
    if (state.kind !== 'idle') {
      dispatch({ type: 'reset' });
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (isVerified) onConfirm(state.key);
        else void generate();
      }}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '30px 24px 28px',
        animation: 'fadeplain .2s ease'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <span style={capLabel}>Step 01 · Credentials</span>
        <h1
          style={{
            fontSize: '29px',
            fontWeight: 500,
            margin: 0,
            letterSpacing: '-.6px',
            lineHeight: '1.05'
          }}
        >
          Derive your key
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: '1.55',
            color: 'var(--muted)',
            maxWidth: '30ch'
          }}
        >
          Nothing is stored or checked. The fingerprint is your only signal that
          the pair is right.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginTop: '30px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <label style={capLabel}>Username</label>
          <input
            value={username}
            onInput={(event) => {
              setUsername((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="identity"
            autocomplete="off"
            spellcheck={false}
            style={fieldStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <label style={capLabel}>Password</label>
          <input
            type="password"
            value={password}
            onInput={(event) => {
              setPassword((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="passphrase"
            autocomplete="off"
            style={fieldStyle}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '26px',
          minHeight: '96px',
          display: 'flex',
          flexDirection: 'column',
          gap: '11px'
        }}
      >
        <span style={capLabel}>Login fingerprint</span>
        {isDeriving && (
          <div style={{ display: 'flex', gap: '11px' }}>
            <div style={skel('120px', '32px')} />
            <div style={skel('96px', '32px')} />
          </div>
        )}
        {isVerified && (
          <div style={{ animation: 'fadein .28s ease' }}>
            <div
              style={{
                fontFamily: "'Space Mono',monospace",
                fontSize: '27px',
                fontWeight: 700,
                color: 'var(--fg)',
                letterSpacing: '.5px'
              }}
            >
              {state.fingerprint}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted)',
                marginTop: '7px'
              }}
            >
              Recognize these two words? Then proceed.
            </div>
          </div>
        )}
        {state.kind === 'idle' && (
          <div
            style={{
              fontFamily: "'Space Mono',monospace",
              fontSize: '26px',
              color: 'var(--hint)',
              letterSpacing: '5px'
            }}
          >
            •••• ••••
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button type="submit" style={btnPrimary(disabled)}>
          {isDeriving ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid var(--primary-fg)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin .7s linear infinite'
                }}
              />
              Deriving…
            </span>
          ) : isVerified ? (
            'Proceed →'
          ) : (
            'Generate fingerprint'
          )}
        </button>
      </div>
    </form>
  );
}
