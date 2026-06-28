import type { JSX } from 'preact';

interface TopbarProps {
  theme: 'dark' | 'light';
  onToggleTheme(): void;
  showMenu: boolean;
  onOpenMenu(): void;
}

export function Topbar({
  theme,
  onToggleTheme,
  showMenu,
  onOpenMenu
}: TopbarProps): JSX.Element {
  return (
    <div
      style={{
        height: '54px',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        borderBottom: '1px solid var(--topbar-border)'
      }}
    >
      <span
        style={{
          fontFamily: "'Space Mono',monospace",
          fontSize: '12px',
          letterSpacing: '1px',
          color: 'var(--fg)'
        }}
      >
        pin<span style={{ color: 'var(--faint)' }}>·</span>derive
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '9px',
            cursor: 'pointer',
            color: 'var(--fg)',
            fontSize: '15px',
            lineHeight: '1',
            padding: '0',
            transition: 'border-color .15s'
          }}
        >
          {theme === 'light' ? '☾' : '☀︎'}
        </button>
        {showMenu && (
          <button
            onClick={onOpenMenu}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              margin: '-8px'
            }}
          >
            <span
              style={{
                width: '18px',
                height: '1.5px',
                background: 'var(--fg)',
                display: 'block'
              }}
            />
            <span
              style={{
                width: '18px',
                height: '1.5px',
                background: 'var(--fg)',
                display: 'block'
              }}
            />
            <span
              style={{
                width: '18px',
                height: '1.5px',
                background: 'var(--fg)',
                display: 'block'
              }}
            />
          </button>
        )}
      </div>
    </div>
  );
}
