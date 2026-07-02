import type { JSX } from 'preact';
import styles from './Splash.module.css';

export function Splash(): JSX.Element {
  return (
    <div className={styles.splash}>
      <span className={styles.brand}>
        pin<span>·</span>derive
      </span>
    </div>
  );
}
