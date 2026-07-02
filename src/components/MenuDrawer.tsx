import type { JSX } from 'preact';
import { CapLabel } from './CapLabel';
import styles from './MenuDrawer.module.css';

interface MenuDrawerProps {
  revealTime: number;
  onChangeRevealTime(milliseconds: number): void;
  onLogout(): void;
  onClose(): void;
}

export function MenuDrawer({
  revealTime,
  onChangeRevealTime,
  onLogout,
  onClose
}: MenuDrawerProps): JSX.Element {
  return (
    <div className={styles.drawerRoot}>
      <div onClick={onClose} className={styles.scrim} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Settings</span>
          <button onClick={onClose} className={styles.closeButton}>
            ✕
          </button>
        </div>

        <div className={styles.section}>
          <CapLabel>Reveal time</CapLabel>
          <div className={styles.optionRow}>
            {([150, 250, 500, 1000] as const).map((milliseconds) => (
              <button
                key={milliseconds}
                onClick={() => onChangeRevealTime(milliseconds)}
                aria-pressed={revealTime === milliseconds}
                className={styles.optionButton}
              >
                {milliseconds}
              </button>
            ))}
          </div>
          <div className={styles.customRow}>
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
              className={styles.input}
            />
            <span className={styles.inputCaption}>ms per segment</span>
          </div>
        </div>

        <div className={styles.footer}>
          <button onClick={onLogout} className={styles.logoutButton}>
            Log out
          </button>
          <span className={styles.footerNote}>
            Returns to credentials. The master key is forgotten — you'll
            re-derive on next login.
          </span>
        </div>
      </div>
    </div>
  );
}
