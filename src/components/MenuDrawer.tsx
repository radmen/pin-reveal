import type { JSX } from 'preact';
import { capLabel } from './styles';

interface MenuDrawerProps {
  revealTime: number;
  onChangeRevealTime(milliseconds: number): void;
  onLogout(): void;
  onClose(): void;
}

function rtBtn(active: boolean): JSX.CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    borderRadius: '8px',
    border: active ? '1px solid var(--fg)' : '1px solid var(--border)',
    background: active ? 'var(--fg)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--muted)',
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: '12.5px',
    cursor: 'pointer',
    transition: 'all .15s'
  };
}

export function MenuDrawer({
  revealTime,
  onChangeRevealTime,
  onLogout,
  onClose
}: MenuDrawerProps): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end'
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: '0',
          background: 'var(--scrim)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeplain .2s ease'
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '300px',
          maxWidth: '84%',
          height: '100%',
          background: 'var(--menu-bg)',
          borderLeft: '1px solid var(--border)',
          padding: '26px 24px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slidein .22s ease'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '30px'
          }}
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '-.3px'
            }}
          >
            Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          <span style={capLabel}>Reveal time</span>
          <div style={{ display: 'flex', gap: '7px' }}>
            {([150, 250, 500, 1000] as const).map((milliseconds) => (
              <button
                key={milliseconds}
                onClick={() => onChangeRevealTime(milliseconds)}
                style={rtBtn(revealTime === milliseconds)}
              >
                {milliseconds}
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '4px'
            }}
          >
            <input
              type="number"
              min="50"
              max="5000"
              step="50"
              value={revealTime}
              onInput={(event) =>
                onChangeRevealTime(
                  parseInt((event.target as HTMLInputElement).value) || 0
                )
              }
              style={{
                width: '96px',
                background: 'var(--field)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: 'var(--fg)',
                fontFamily: "'Space Mono',monospace",
                fontSize: '14px',
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
              ms per segment
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '11px',
              border: '1px solid var(--border2)',
              background: 'transparent',
              color: 'var(--fg)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Log out
          </button>
          <span
            style={{
              fontSize: '11.5px',
              color: 'var(--faint)',
              lineHeight: '1.5'
            }}
          >
            Returns to credentials. The master key is forgotten — you'll
            re-derive on next login.
          </span>
        </div>
      </div>
    </div>
  );
}
