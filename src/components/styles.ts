import type { JSX } from 'preact';

export const capLabel: JSX.CSSProperties = {
  fontFamily: "'Space Mono',monospace",
  fontSize: '10px',
  letterSpacing: '2px',
  color: 'var(--faint)',
  textTransform: 'uppercase'
};

export function btnPrimary(disabled: boolean): JSX.CSSProperties {
  return {
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    background: 'var(--primary-bg)',
    color: 'var(--primary-fg)',
    fontFamily: "'Space Grotesk',sans-serif",
    fontWeight: 600,
    fontSize: '15px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.28 : 1,
    transition: 'opacity .2s,background .25s,color .25s',
    letterSpacing: '.2px'
  };
}
