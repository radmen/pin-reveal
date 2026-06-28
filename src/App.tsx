import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  derivePin,
  forgetKey,
  labelFingerprint,
  loadKey,
  loginFingerprint,
  normalize,
  storeKey
} from './derive';

type Phase = 'login' | 'label' | 'reveal';

interface State {
  phase: Phase;
  username: string;
  password: string;
  loginDirty: boolean;
  deriving: boolean;
  loginFp: string | null;
  label: string;
  length: number;
  customMode: boolean;
  customLen: number;
  labelBusy: boolean;
  labelClean: boolean;
  labelFp: string | null;
  pin: string | null;
  segments: string[];
  revealIndex: number;
  revealVisible: boolean;
  revealLabel: string;
  revealTime: number;
  menuOpen: boolean;
  theme: 'dark' | 'light';
}

const INIT: State = {
  phase: 'login',
  username: '',
  password: '',
  loginDirty: true,
  deriving: false,
  loginFp: null,
  label: '',
  length: 4,
  customMode: false,
  customLen: 5,
  labelBusy: false,
  labelClean: false,
  labelFp: null,
  pin: null,
  segments: [],
  revealIndex: -1,
  revealVisible: false,
  revealLabel: '',
  revealTime: 250,
  menuOpen: false,
  theme: 'dark'
};

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

export function App(): JSX.Element {
  const [s, setS] = useState<State>(INIT);
  const set = (partial: Partial<State>) =>
    setS((prev) => ({ ...prev, ...partial }));

  const masterKey = useRef<CryptoKey | null>(null);
  const pendingKey = useRef<CryptoKey | null>(null);
  const token = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pinderive.theme');
      if (saved === 'dark' || saved === 'light') set({ theme: saved });
    } catch {}
    loadKey()
      .then((key) => {
        if (key) {
          masterKey.current = key;
          set({ phase: 'label' });
        }
      })
      .catch(() => {});
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  async function generateLogin() {
    const u = s.username;
    const p = s.password;
    if (!u || !p) return;
    const t = ++token.current;
    set({ deriving: true });
    const worker = new Worker(new URL('./derive.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.postMessage({ password: p, username: u });
    const key = await new Promise<CryptoKey>((resolve) => {
      worker.onmessage = (event) => resolve(event.data);
    });
    worker.terminate();
    if (t !== token.current) return;
    const fp = await loginFingerprint(key);
    if (t !== token.current) return;
    pendingKey.current = key;
    set({ deriving: false, loginDirty: false, loginFp: fp });
  }

  function proceedLogin() {
    masterKey.current = pendingKey.current;
    storeKey(masterKey.current!).catch(() => {});
    set({
      phase: 'label',
      label: '',
      customMode: false,
      labelClean: false,
      labelFp: null,
      pin: null
    });
  }

  async function generateLabel() {
    if (!s.label.trim()) return;
    const len = s.customMode
      ? Math.max(3, Math.min(12, s.customLen || 0))
      : s.length;
    set({ labelBusy: true, labelClean: false, labelFp: null, pin: null });
    const [fp, pin] = await Promise.all([
      labelFingerprint(masterKey.current!, s.label),
      derivePin(masterKey.current!, s.label, len)
    ]);
    set({ labelBusy: false, labelClean: true, labelFp: fp, pin });
  }

  function proceedLabel() {
    const pin = s.pin!;
    const segs: string[] = [];
    for (let i = 0; i < pin.length; i += 2) segs.push(pin.slice(i, i + 2));
    set({
      phase: 'reveal',
      segments: segs,
      revealIndex: -1,
      revealVisible: false,
      revealLabel: normalize(s.label)
    });
  }

  function flash(index: number) {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    set({ revealIndex: index, revealVisible: true });
    revealTimer.current = setTimeout(
      () => set({ revealVisible: false }),
      s.revealTime
    );
  }

  function exitReveal() {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    set({ phase: 'label' });
  }

  function logout() {
    masterKey.current = null;
    pendingKey.current = null;
    token.current++;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    forgetKey().catch(() => {});
    set({
      phase: 'login',
      username: '',
      password: '',
      loginDirty: true,
      deriving: false,
      loginFp: null,
      label: '',
      labelClean: false,
      labelFp: null,
      pin: null,
      menuOpen: false
    });
  }

  function setTheme(theme: 'dark' | 'light') {
    try {
      localStorage.setItem('pinderive.theme', theme);
    } catch {}
    set({ theme });
  }

  // computed
  const loginClean = !!s.loginFp && !s.loginDirty;
  const loginDisabled =
    s.deriving || (!loginClean && !(s.username && s.password));
  const labelInvalid =
    !s.label.trim() || (s.customMode && (s.customLen < 3 || s.customLen > 12));
  const labelDisabled = s.labelBusy || (!s.labelClean && labelInvalid);
  const started = s.revealIndex >= 0;
  const isLast = s.revealIndex >= s.segments.length - 1;
  const revealCaption = started
    ? `Segment ${s.revealIndex + 1} / ${s.segments.length} · shown ${s.revealTime}ms`
    : `Press Reveal to show segment 1 / ${s.segments.length}`;

  const vars = s.theme === 'light' ? LIGHT : DARK;

  // style helpers
  function btnPrimary(disabled: boolean): JSX.CSSProperties {
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

  function lenBtn(active: boolean): JSX.CSSProperties {
    return {
      flex: 1,
      padding: '13px 0',
      borderRadius: '10px',
      border: active ? '1px solid var(--fg)' : '1px solid var(--border)',
      background: active ? 'var(--fg)' : 'transparent',
      color: active ? 'var(--bg)' : 'var(--muted)',
      fontFamily: "'Space Mono',monospace",
      fontWeight: 700,
      fontSize: '15px',
      cursor: 'pointer',
      transition: 'all .15s'
    };
  }

  function rtBtn(active: boolean): JSX.CSSProperties {
    return {
      flex: 1,
      padding: '10px 0',
      borderRadius: '8px',
      border: active ? '1px solid var(--fg)' : '1px solid var(--border)',
      background: active ? 'var(--fg)' : 'transparent',
      color: active ? 'var(--bg)' : 'var(--muted)',
      fontFamily: "'Space Mono',monospace",
      fontWeight: 700,
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all .15s'
    };
  }

  function segBox(active: boolean, shown: boolean): JSX.CSSProperties {
    const base: JSX.CSSProperties = {
      width: '60px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      fontFamily: "'Space Mono',monospace",
      fontSize: '24px',
      letterSpacing: '3px',
      fontWeight: 700,
      transition: 'all .12s'
    };
    if (active && shown)
      return {
        ...base,
        border: '1px solid var(--fg)',
        background: 'var(--active-bg)',
        color: 'var(--fg)'
      };
    if (active)
      return {
        ...base,
        border: '1px solid var(--fg)',
        background: 'var(--active-bg)',
        color: 'var(--seg-fg)'
      };
    return {
      ...base,
      border: '1px solid var(--seg-border)',
      background: 'transparent',
      color: 'var(--seg-fg)'
    };
  }

  const skel = (width: string, height: string): JSX.CSSProperties => ({
    height,
    width,
    borderRadius: '8px',
    background: 'linear-gradient(90deg,var(--skel1),var(--skel2),var(--skel1))',
    backgroundSize: '400px 100%',
    animation: 'shimmer 1.3s linear infinite'
  });

  const fieldStyle: JSX.CSSProperties = {
    width: '100%',
    background: 'var(--field)',
    border: '1px solid var(--border)',
    borderRadius: '11px',
    padding: '14px',
    color: 'var(--fg)',
    fontFamily: "'Space Mono',monospace",
    fontSize: '15px',
    transition: 'border-color .15s,background .25s'
  };

  const capLabel: JSX.CSSProperties = {
    fontFamily: "'Space Mono',monospace",
    fontSize: '10px',
    letterSpacing: '2px',
    color: 'var(--faint)',
    textTransform: 'uppercase'
  };

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
          {/* TOP BAR */}
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
                onClick={() => setTheme(s.theme === 'light' ? 'dark' : 'light')}
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
                {s.theme === 'light' ? '☾' : '☀︎'}
              </button>
              {s.phase !== 'login' && (
                <button
                  onClick={() => set({ menuOpen: !s.menuOpen })}
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

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* ── LOGIN ── */}
            {s.phase === 'login' && (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '30px 24px 28px',
                  animation: 'fadeplain .2s ease'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px'
                  }}
                >
                  <span style={capLabel}>Step 01 · Credentials</span>
                  <h1
                    style={{
                      fontSize: '29px',
                      fontWeight: 500,
                      margin: 0,
                      letterSpacing: '-.6px',
                      lineHeight: '1.05'
                    }}
                  >
                    Derive your key
                  </h1>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      lineHeight: '1.55',
                      color: 'var(--muted)',
                      maxWidth: '30ch'
                    }}
                  >
                    Nothing is stored or checked. The fingerprint is your only
                    signal that the pair is right.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    marginTop: '30px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px'
                    }}
                  >
                    <label style={capLabel}>Username</label>
                    <input
                      value={s.username}
                      onInput={(e) => {
                        token.current++;
                        set({
                          username: (e.target as HTMLInputElement).value,
                          loginDirty: true,
                          loginFp: null,
                          deriving: false
                        });
                      }}
                      placeholder="identity"
                      autocomplete="off"
                      spellcheck={false}
                      style={fieldStyle}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px'
                    }}
                  >
                    <label style={capLabel}>Password</label>
                    <input
                      type="password"
                      value={s.password}
                      onInput={(e) => {
                        token.current++;
                        set({
                          password: (e.target as HTMLInputElement).value,
                          loginDirty: true,
                          loginFp: null,
                          deriving: false
                        });
                      }}
                      placeholder="passphrase"
                      autocomplete="off"
                      style={fieldStyle}
                    />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '26px',
                    minHeight: '96px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '11px'
                  }}
                >
                  <span style={capLabel}>Login fingerprint</span>
                  {s.deriving && (
                    <div style={{ display: 'flex', gap: '11px' }}>
                      <div style={skel('120px', '32px')} />
                      <div style={skel('96px', '32px')} />
                    </div>
                  )}
                  {s.loginFp && !s.deriving && (
                    <div style={{ animation: 'fadein .28s ease' }}>
                      <div
                        style={{
                          fontFamily: "'Space Mono',monospace",
                          fontSize: '27px',
                          fontWeight: 700,
                          color: 'var(--fg)',
                          letterSpacing: '.5px'
                        }}
                      >
                        {s.loginFp}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted)',
                          marginTop: '7px'
                        }}
                      >
                        Recognize these two words? Then proceed.
                      </div>
                    </div>
                  )}
                  {!s.loginFp && !s.deriving && (
                    <div
                      style={{
                        fontFamily: "'Space Mono',monospace",
                        fontSize: '26px',
                        color: 'var(--hint)',
                        letterSpacing: '5px'
                      }}
                    >
                      •••• ••••
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <button
                    onClick={() => {
                      if (loginDisabled) return;
                      if (loginClean) proceedLogin();
                      else void generateLogin();
                    }}
                    style={btnPrimary(loginDisabled)}
                  >
                    {s.deriving ? (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px'
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid var(--primary-fg)',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'spin .7s linear infinite'
                          }}
                        />
                        Deriving…
                      </span>
                    ) : loginClean ? (
                      'Proceed →'
                    ) : (
                      'Generate fingerprint'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── LABEL / DERIVE ── */}
            {s.phase === 'label' && (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '30px 24px 28px',
                  animation: 'fadeplain .2s ease'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px'
                  }}
                >
                  <span style={capLabel}>Step 02 · Derive a PIN</span>
                  <h1
                    style={{
                      fontSize: '29px',
                      fontWeight: 500,
                      margin: 0,
                      letterSpacing: '-.6px',
                      lineHeight: '1.05'
                    }}
                  >
                    New PIN
                  </h1>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    marginTop: '26px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px'
                    }}
                  >
                    <label style={capLabel}>Label</label>
                    <input
                      value={s.label}
                      onInput={(e) =>
                        set({
                          label: (e.target as HTMLInputElement).value,
                          labelClean: false,
                          labelFp: null,
                          pin: null
                        })
                      }
                      placeholder="e.g. visa, front-door"
                      autocomplete="off"
                      spellcheck={false}
                      style={fieldStyle}
                    />
                    {normalize(s.label) && (
                      <span
                        style={{
                          fontFamily: "'Space Mono',monospace",
                          fontSize: '11px',
                          color: 'var(--faint)'
                        }}
                      >
                        → {normalize(s.label)}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '9px'
                    }}
                  >
                    <label style={capLabel}>PIN length</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {([4, 6, 8] as const).map((n) => (
                        <button
                          key={n}
                          onClick={() =>
                            set({
                              length: n,
                              customMode: false,
                              labelClean: false,
                              labelFp: null,
                              pin: null
                            })
                          }
                          style={lenBtn(!s.customMode && s.length === n)}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          set({
                            customMode: true,
                            labelClean: false,
                            labelFp: null,
                            pin: null
                          })
                        }
                        style={lenBtn(s.customMode)}
                      >
                        ···
                      </button>
                    </div>
                    {s.customMode && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          marginTop: '2px'
                        }}
                      >
                        <input
                          type="number"
                          min="3"
                          max="12"
                          value={s.customLen}
                          onInput={(e) =>
                            set({
                              customLen:
                                parseInt(
                                  (e.target as HTMLInputElement).value
                                ) || 0,
                              labelClean: false,
                              labelFp: null,
                              pin: null
                            })
                          }
                          style={{
                            width: '84px',
                            background: 'var(--field)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '11px 12px',
                            color: 'var(--fg)',
                            fontFamily: "'Space Mono',monospace",
                            fontSize: '15px',
                            transition: 'border-color .15s'
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "'Space Mono',monospace",
                            fontSize: '12px',
                            color: 'var(--muted)'
                          }}
                        >
                          digits (3–12)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '26px',
                    minHeight: '84px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '11px'
                  }}
                >
                  <span style={capLabel}>Label fingerprint</span>
                  {s.labelBusy && (
                    <div style={{ display: 'flex', gap: '11px' }}>
                      <div style={skel('108px', '30px')} />
                      <div style={skel('88px', '30px')} />
                    </div>
                  )}
                  {s.labelFp && !s.labelBusy && (
                    <div style={{ animation: 'fadein .28s ease' }}>
                      <div
                        style={{
                          fontFamily: "'Space Mono',monospace",
                          fontSize: '25px',
                          fontWeight: 700,
                          color: 'var(--fg)',
                          letterSpacing: '.5px'
                        }}
                      >
                        {s.labelFp}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted)',
                          marginTop: '7px'
                        }}
                      >
                        PIN ready — proceed to reveal it.
                      </div>
                    </div>
                  )}
                  {!s.labelFp && !s.labelBusy && (
                    <div
                      style={{
                        fontFamily: "'Space Mono',monospace",
                        fontSize: '25px',
                        color: 'var(--hint)',
                        letterSpacing: '5px'
                      }}
                    >
                      •••• ••••
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {s.labelClean && (
                    <button
                      onClick={() =>
                        set({ labelClean: false, labelFp: null, pin: null })
                      }
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '11px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--muted)',
                        fontFamily: "'Space Grotesk',sans-serif",
                        fontWeight: 500,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (labelDisabled) return;
                      if (s.labelClean) proceedLabel();
                      else void generateLabel();
                    }}
                    style={btnPrimary(labelDisabled)}
                  >
                    {s.labelBusy
                      ? 'Generating…'
                      : s.labelClean
                        ? 'Proceed →'
                        : 'Generate PIN'}
                  </button>
                </div>
              </div>
            )}

            {/* ── REVEAL ── */}
            {s.phase === 'reveal' && (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '22px 24px 28px',
                  animation: 'fadeplain .2s ease'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <button
                    onClick={exitReveal}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--fg)',
                      fontFamily: "'Space Mono',monospace",
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    ←
                  </button>
                  <span
                    style={{
                      fontFamily: "'Space Mono',monospace",
                      fontSize: '12px',
                      letterSpacing: '1px',
                      color: 'var(--muted)'
                    }}
                  >
                    {s.revealLabel}
                  </span>
                  <span style={{ width: '38px' }} />
                </div>

                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '30px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px'
                    }}
                  >
                    <span style={capLabel}>Step 03 · Reveal</span>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        justifyContent: 'center',
                        maxWidth: '300px'
                      }}
                    >
                      {s.segments.map((seg, i) => {
                        const active = i === s.revealIndex;
                        const shown = active && s.revealVisible;
                        return (
                          <div key={i} style={segBox(active, shown)}>
                            {shown ? seg : '•'.repeat(seg.length)}
                          </div>
                        );
                      })}
                    </div>
                    <span
                      style={{
                        fontFamily: "'Space Mono',monospace",
                        fontSize: '11.5px',
                        color: 'var(--muted)',
                        letterSpacing: '.5px'
                      }}
                    >
                      {revealCaption}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {started && (
                    <button
                      onClick={() => flash(s.revealIndex)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '11px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--muted)',
                        fontFamily: "'Space Grotesk',sans-serif",
                        fontWeight: 500,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      Re-reveal segment
                    </button>
                  )}
                  {!isLast && (
                    <button
                      onClick={() => flash(s.revealIndex + 1)}
                      style={btnPrimary(false)}
                    >
                      {started ? 'Next →' : 'Reveal segment →'}
                    </button>
                  )}
                  {isLast && (
                    <button onClick={exitReveal} style={btnPrimary(false)}>
                      Done
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── MENU OVERLAY ── */}
          {s.menuOpen && (
            <div
              style={{
                position: 'absolute',
                inset: '0',
                zIndex: 50,
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <div
                onClick={() => set({ menuOpen: false })}
                style={{
                  position: 'absolute',
                  inset: '0',
                  background: 'var(--scrim)',
                  backdropFilter: 'blur(2px)',
                  animation: 'fadeplain .2s ease'
                }}
              />
              <div
                style={{
                  position: 'relative',
                  width: '300px',
                  maxWidth: '84%',
                  height: '100%',
                  background: 'var(--menu-bg)',
                  borderLeft: '1px solid var(--border)',
                  padding: '26px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'slidein .22s ease'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '30px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      letterSpacing: '-.3px'
                    }}
                  >
                    Settings
                  </span>
                  <button
                    onClick={() => set({ menuOpen: false })}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '11px'
                  }}
                >
                  <span style={capLabel}>Reveal time</span>
                  <div style={{ display: 'flex', gap: '7px' }}>
                    {([150, 250, 500, 1000] as const).map((ms) => (
                      <button
                        key={ms}
                        onClick={() => set({ revealTime: ms })}
                        style={rtBtn(s.revealTime === ms)}
                      >
                        {ms}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '4px'
                    }}
                  >
                    <input
                      type="number"
                      min="50"
                      max="5000"
                      step="50"
                      value={s.revealTime}
                      onInput={(e) =>
                        set({
                          revealTime:
                            parseInt((e.target as HTMLInputElement).value) || 0
                        })
                      }
                      style={{
                        width: '96px',
                        background: 'var(--field)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        color: 'var(--fg)',
                        fontFamily: "'Space Mono',monospace",
                        fontSize: '14px',
                        transition: 'border-color .15s'
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "'Space Mono',monospace",
                        fontSize: '12px',
                        color: 'var(--muted)'
                      }}
                    >
                      ms per segment
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <button
                    onClick={logout}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '11px',
                      border: '1px solid var(--border2)',
                      background: 'transparent',
                      color: 'var(--fg)',
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Log out
                  </button>
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--faint)',
                      lineHeight: '1.5'
                    }}
                  >
                    Returns to credentials. The master key is forgotten — you'll
                    re-derive on next login.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
