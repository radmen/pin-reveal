import type { ComponentChildren, JSX } from 'preact';

type AppBannerTone = 'update' | 'warning';

const BORDER_COLORS: Record<AppBannerTone, string> = {
  update: '#38bdf8',
  warning: '#f59e0b'
};

const BACKGROUNDS: Record<AppBannerTone, string> = {
  update: 'rgba(56, 189, 248, .12)',
  warning: 'rgba(245, 158, 11, .12)'
};

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
    <div
      role={role}
      style={{
        margin: '14px 18px 0',
        padding: '13px 14px',
        border: `1px solid ${BORDER_COLORS[tone]}`,
        borderRadius: '13px',
        background: BACKGROUNDS[tone],
        color: 'var(--fg)',
        fontSize: '12.5px',
        lineHeight: '1.45'
      }}
    >
      {children}
    </div>
  );
}
