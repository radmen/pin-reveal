import type { JSX } from 'preact';
import { useReducer, useState } from 'preact/hooks';
import { btnPrimary, capLabel } from '../components/styles';
import { derivePin, labelFingerprint, normalize } from '../derive';

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
  onProceed(pin: string, label: string): void;
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

function lenBtn(active: boolean): JSX.CSSProperties {
  return {
    flex: 1,
    padding: '13px 0',
    borderRadius: '10px',
    border: active ? '1px solid var(--fg)' : '1px solid var(--border)',
    background: active ? 'var(--fg)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--muted)',
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'all .15s'
  };
}

const skel = (width: string, height: string): JSX.CSSProperties => ({
  height,
  width,
  borderRadius: '8px',
  background: 'linear-gradient(90deg,var(--skel1),var(--skel2),var(--skel1))',
  backgroundSize: '400px 100%',
  animation: 'shimmer 1.3s linear infinite'
});

export function LabelScreen({
  masterKey,
  onProceed
}: LabelScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(labelReducer, { kind: 'idle' });
  const [label, setLabel] = useState('');
  const [length, setLength] = useState(4);
  const [customMode, setCustomMode] = useState(false);
  const [customLen, setCustomLen] = useState(5);

  const isVerified = state.kind === 'verified';
  const isBusy = state.kind === 'deriving';
  const labelInvalid =
    !label.trim() || (customMode && (customLen < 3 || customLen > 12));
  const disabled = isBusy || (!isVerified && labelInvalid);

  function resetIfNotIdle() {
    if (state.kind !== 'idle') {
      dispatch({ type: 'reset' });
    }
  }

  async function generate() {
    const resolvedLength = customMode
      ? Math.max(3, Math.min(12, customLen || 0))
      : length;
    const runId = Symbol();
    dispatch({ type: 'start', runId });
    const [fingerprint, pin] = await Promise.all([
      labelFingerprint(masterKey, label),
      derivePin(masterKey, label, resolvedLength)
    ]);
    dispatch({ type: 'complete', runId, pin, fingerprint });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (isVerified) onProceed(state.pin, label);
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
        <span style={capLabel}>Step 02 · Derive a PIN</span>
        <h1
          style={{
            fontSize: '29px',
            fontWeight: 500,
            margin: 0,
            letterSpacing: '-.6px',
            lineHeight: '1.05'
          }}
        >
          New PIN
        </h1>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          marginTop: '26px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <label style={capLabel}>Label</label>
          <input
            value={label}
            onInput={(event) => {
              setLabel((event.target as HTMLInputElement).value);
              resetIfNotIdle();
            }}
            placeholder="e.g. visa, front-door"
            autocomplete="off"
            spellcheck={false}
            style={fieldStyle}
          />
          {normalize(label) && (
            <span
              style={{
                fontFamily: "'Space Mono',monospace",
                fontSize: '11px',
                color: 'var(--faint)'
              }}
            >
              → {normalize(label)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <label style={capLabel}>PIN length</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([4, 6, 8] as const).map((digits) => (
              <button
                type="button"
                key={digits}
                onClick={() => {
                  setLength(digits);
                  setCustomMode(false);
                  resetIfNotIdle();
                }}
                style={lenBtn(!customMode && length === digits)}
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
              style={lenBtn(customMode)}
            >
              ···
            </button>
          </div>
          {customMode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '2px'
              }}
            >
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
                style={{
                  width: '84px',
                  background: 'var(--field)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '11px 12px',
                  color: 'var(--fg)',
                  fontFamily: "'Space Mono',monospace",
                  fontSize: '15px',
                  transition: 'border-color .15s'
                }}
              />
              <span
                style={{
                  fontFamily: "'Space Mono',monospace",
                  fontSize: '12px',
                  color: 'var(--muted)'
                }}
              >
                digits (3–12)
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '26px',
          minHeight: '84px',
          display: 'flex',
          flexDirection: 'column',
          gap: '11px'
        }}
      >
        <span style={capLabel}>Label fingerprint</span>
        {isBusy && (
          <div style={{ display: 'flex', gap: '11px' }}>
            <div style={skel('108px', '30px')} />
            <div style={skel('88px', '30px')} />
          </div>
        )}
        {isVerified && (
          <div style={{ animation: 'fadein .28s ease' }}>
            <div
              style={{
                fontFamily: "'Space Mono',monospace",
                fontSize: '25px',
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
              PIN ready — proceed to reveal it.
            </div>
          </div>
        )}
        {state.kind === 'idle' && (
          <div
            style={{
              fontFamily: "'Space Mono',monospace",
              fontSize: '25px',
              color: 'var(--hint)',
              letterSpacing: '5px'
            }}
          >
            •••• ••••
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {isVerified && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '11px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--muted)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 500,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        )}
        <button type="submit" style={btnPrimary(disabled)}>
          {isBusy ? 'Generating…' : isVerified ? 'Proceed →' : 'Generate PIN'}
        </button>
      </div>
    </form>
  );
}
