import type { JSX } from 'preact';

import type { ApplyAppUpdate } from '../pwa-update';
import { AppBanner } from './AppBanner';

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
      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <strong style={{ display: 'block', marginBottom: '4px' }}>
            A new version is ready.
          </strong>
          Refresh when you are ready to use the latest build.
        </div>
        <button
          onClick={applyUpdate}
          style={{
            alignSelf: 'flex-start',
            background: 'var(--primary-bg)',
            border: '1px solid var(--border2)',
            borderRadius: '999px',
            color: 'var(--primary-fg)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 700,
            padding: '7px 10px',
            whiteSpace: 'nowrap'
          }}
        >
          Refresh
        </button>
      </div>
    </AppBanner>
  );
}
