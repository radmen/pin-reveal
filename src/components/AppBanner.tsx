import type { ComponentChildren, JSX } from 'preact';
import styles from './AppBanner.module.css';

type AppBannerTone = 'update' | 'warning';

export function AppBanner({
  children,
  role,
  tone
}: {
  children: ComponentChildren;
  role: 'alert' | 'status';
  tone: AppBannerTone;
}): JSX.Element {
  return (
    <div role={role} data-tone={tone} className={styles.banner}>
      {children}
    </div>
  );
}
