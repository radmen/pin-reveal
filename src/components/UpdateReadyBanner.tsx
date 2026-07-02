import type { JSX } from 'preact';

import type { ApplyAppUpdate } from '../pwa-update';
import { AppBanner } from './AppBanner';
import styles from './BannerContent.module.css';

export function UpdateReadyBanner({
  applyUpdate
}: {
  applyUpdate: ApplyAppUpdate | null;
}): JSX.Element | null {
  if (!applyUpdate) {
    return null;
  }

  return (
    <AppBanner role="status" tone="update">
      <div className={styles.content}>
        <div>
          <strong className={styles.title}>A new version is ready.</strong>
          Refresh when you are ready to use the latest build.
        </div>
        <button onClick={applyUpdate} className={styles.refreshButton}>
          Refresh
        </button>
      </div>
    </AppBanner>
  );
}
