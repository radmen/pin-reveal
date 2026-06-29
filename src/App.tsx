import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MenuDrawer } from './components/MenuDrawer';
import { Topbar } from './components/Topbar';
import { forgetKey, loadKey, storeKey } from './derive';
import { LabelScreen } from './screens/LabelScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RevealScreen } from './screens/RevealScreen';

const DARK: Record<string, string> = {
  '--bg': '#000',
  '--fg': '#fafafa',
  '--muted': '#71717a',
  '--faint': '#52525b',
  '--field': '#0c0c0d',
  '--border': '#262629',
  '--border2': '#3f3f46',
  '--primary-bg': '#fafafa',
  '--primary-fg': '#000',
  '--hint': '#222226',
  '--seg-border': '#1c1c1f',
  '--seg-fg': '#2e2e33',
  '--active-bg': '#0d0d0d',
  '--backdrop': '#161618',
  '--phone-border': '#232327',
  '--menu-bg': '#0a0a0b',
  '--skel1': '#141416',
  '--skel2': '#26262b',
  '--topbar-border': '#131316',
  '--placeholder': '#45454b',
  '--scrim': 'rgba(0,0,0,.6)',
  '--shadow': '0 30px 80px rgba(0,0,0,.55)'
};

const LIGHT: Record<string, string> = {
  '--bg': '#ffffff',
  '--fg': '#0c0c0d',
  '--muted': '#6b6b70',
  '--faint': '#9a9aa0',
  '--field': '#f4f4f5',
  '--border': '#dcdce0',
  '--border2': '#aeaeb4',
  '--primary-bg': '#0c0c0d',
  '--primary-fg': '#ffffff',
  '--hint': '#d8d8dc',
  '--seg-border': '#e4e4e8',
  '--seg-fg': '#bcbcc4',
  '--active-bg': '#f7f7f8',
  '--backdrop': '#e7e7ea',
  '--phone-border': '#d0d0d6',
  '--menu-bg': '#fbfbfc',
  '--skel1': '#ececef',
  '--skel2': '#dadade',
  '--topbar-border': '#eeeef1',
  '--placeholder': '#aeaeb4',
  '--scrim': 'rgba(0,0,0,.32)',
  '--shadow': '0 22px 60px rgba(0,0,0,.13)'
};

type Theme = 'dark' | 'light';

function findStoredTheme(): Theme | null {
  try {
    const savedTheme = localStorage.getItem('pinderive.theme');

    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }

    return null;
  } catch {
    return null;
  }
}

function storeThemePreference(theme: Theme): void {
  try {
    localStorage.setItem('pinderive.theme', theme);
  } catch {
    return;
  }
}

function Splash(): JSX.Element {
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

export function App(): JSX.Element {
  // ponytail: undefined = IDB loading (Splash); null = no key (LoginScreen).
  // jsdom has no indexedDB, so skip Splash in tests by initialising to null.
  const [key, setKey] = useState<CryptoKey | null | undefined>(
    typeof indexedDB === 'undefined' ? null : undefined
  );
  const [theme, setTheme] = useState<Theme>('dark');
  const [revealTime, setRevealTime] = useState(250);
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelResult, setLabelResult] = useState<{
    pin: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    const savedTheme = findStoredTheme();

    if (savedTheme) {
      setTheme(savedTheme);
    }

    loadKey()
      .then((loadedKey) => setKey(loadedKey ?? null))
      .catch(() => setKey(null));
  }, []);

  function handleLoginConfirm(confirmedKey: CryptoKey) {
    setKey(confirmedKey);
    storeKey(confirmedKey).catch(() => {});
  }

  function handleLogout() {
    setKey(null);
    setLabelResult(null);
    setMenuOpen(false);
    forgetKey().catch(() => {});
  }

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  function screen(): JSX.Element {
    if (key === undefined) return <Splash />;
    if (key === null) return <LoginScreen onConfirm={handleLoginConfirm} />;
    if (!labelResult) {
      return (
        <LabelScreen
          masterKey={key}
          onProceed={(pin, label) => setLabelResult({ pin, label })}
        />
      );
    }
    return (
      <RevealScreen
        pin={labelResult.pin}
        label={labelResult.label}
        revealTime={revealTime}
        onExit={() => setLabelResult(null)}
      />
    );
  }

  const vars = theme === 'light' ? LIGHT : DARK;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--backdrop)',
        fontFamily: "'Space Grotesk',sans-serif",
        transition: 'background .25s',
        ...(vars as JSX.CSSProperties)
      }}
    >
      <div
        style={{
          width: '440px',
          height: 'min(800px,calc(100vh - 64px))',
          background: 'var(--bg)',
          border: '1px solid var(--phone-border)',
          borderRadius: '22px',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: 'var(--shadow)',
          transition: 'background .25s,border-color .25s'
        }}
      >
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            color: 'var(--fg)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'background .25s,color .25s'
          }}
        >
          <Topbar
            theme={theme}
            onToggleTheme={toggleTheme}
            showMenu={!!key}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {screen()}
          </div>
          {menuOpen && (
            <MenuDrawer
              revealTime={revealTime}
              onChangeRevealTime={setRevealTime}
              onLogout={handleLogout}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
