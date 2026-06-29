import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CapLabel } from '../components/CapLabel';
import { PrimaryButton } from '../components/PrimaryButton';
import { normalize } from '../derive';

interface RevealScreenProps {
  pin: string;
  label: string;
  revealTime: number;
  onExit(): void;
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
  if (active && shown) {
    return {
      ...base,
      border: '1px solid var(--fg)',
      background: 'var(--active-bg)',
      color: 'var(--fg)'
    };
  }
  if (active) {
    return {
      ...base,
      border: '1px solid var(--fg)',
      background: 'var(--active-bg)',
      color: 'var(--seg-fg)'
    };
  }
  return {
    ...base,
    border: '1px solid var(--seg-border)',
    background: 'transparent',
    color: 'var(--seg-fg)'
  };
}

export function RevealScreen({
  pin,
  label,
  revealTime,
  onExit
}: RevealScreenProps): JSX.Element {
  const segments = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < pin.length; i += 2) result.push(pin.slice(i, i + 2));
    return result;
  }, [pin]);

  const [cursor, setCursor] = useState(-1);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function flash(index: number) {
    if (timer.current) clearTimeout(timer.current);
    setCursor(index);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), revealTime);
  }

  const started = cursor >= 0;
  const isLast = cursor >= segments.length - 1;
  const normalizedLabel = normalize(label);
  const caption = started
    ? `Segment ${cursor + 1} / ${segments.length} · shown ${revealTime}ms`
    : `Press Reveal to show segment 1 / ${segments.length}`;

  return (
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
          onClick={onExit}
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
          {normalizedLabel}
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
          <CapLabel>Step 03 · Reveal</CapLabel>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'center',
              maxWidth: '300px'
            }}
          >
            {segments.map((segment, i) => {
              const active = i === cursor;
              const shown = active && visible;
              return (
                <div key={i} style={segBox(active, shown)}>
                  {shown ? segment : '•'.repeat(segment.length)}
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
            {caption}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {started && (
          <button
            onClick={() => flash(cursor)}
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
          <PrimaryButton onClick={() => flash(cursor + 1)}>
            {started ? 'Next →' : 'Reveal segment →'}
          </PrimaryButton>
        )}
        {isLast && <PrimaryButton onClick={onExit}>Done</PrimaryButton>}
      </div>
    </div>
  );
}
