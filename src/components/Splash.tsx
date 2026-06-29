import type { JSX } from 'preact';

export function Splash(): JSX.Element {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <span
        style={{
          fontFamily: "'Space Mono',monospace",
          fontSize: '14px',
          letterSpacing: '1px',
          color: 'var(--faint)'
        }}
      >
        pin<span>·</span>derive
      </span>
    </div>
  );
}
