import type { JSX } from 'preact';
import styles from './Topbar.module.css';

interface TopbarProps {
  theme: 'dark' | 'light';
  onToggleTheme(): void;
  showMenu: boolean;
  sessionOutcome: 'persisted' | 'in-memory' | null;
  onOpenMenu(): void;
}

export function Topbar({
  theme,
  onToggleTheme,
  showMenu,
  sessionOutcome,
  onOpenMenu
}: TopbarProps): JSX.Element {
  return (
    <div className={styles.topbar}>
      <span className={styles.brand}>
        pin<span className={styles.brandSeparator}>·</span>derive
      </span>
      <div className={styles.actions}>
        {sessionOutcome === 'in-memory' && (
          <span className={styles.sessionBadge}>in-memory</span>
        )}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className={styles.themeButton}
        >
          {theme === 'light' ? '☾' : '☀︎'}
        </button>
        {showMenu && (
          <button
            onClick={onOpenMenu}
            aria-label="Open settings menu"
            className={styles.menuButton}
          >
            {[0, 1, 2].map((index) => (
              <span key={index} className={styles.menuLine} />
            ))}
          </button>
        )}
      </div>
    </div>
  );
}
