import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CapLabel } from '../components/CapLabel';
import { PrimaryButton } from '../components/PrimaryButton';
import { normalizeLabel } from '../derivation-contract';
import styles from './RevealScreen.module.css';

interface RevealScreenProps {
  pin: string;
  label: string;
  revealTime: number;
  onExit(): void;
}

type SegmentState = 'hidden' | 'active' | 'shown';

function getSegmentState(active: boolean, shown: boolean): SegmentState {
  if (shown) {
    return 'shown';
  }

  if (active) {
    return 'active';
  }

  return 'hidden';
}

export function RevealScreen({
  pin,
  label,
  revealTime,
  onExit
}: RevealScreenProps): JSX.Element {
  const segments = useMemo(() => {
    const result: string[] = [];

    for (let i = 0; i < pin.length; i += 2) {
      result.push(pin.slice(i, i + 2));
    }

    return result;
  }, [pin]);

  const [cursor, setCursor] = useState(-1);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function flash(index: number): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setCursor(index);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), revealTime);
  }

  const started = cursor >= 0;
  const isLast = cursor >= segments.length - 1;
  const normalizedLabel = normalizeLabel(label);
  const caption = started
    ? `Segment ${cursor + 1} / ${segments.length} · shown ${revealTime}ms`
    : `Press Reveal to show segment 1 / ${segments.length}`;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button onClick={onExit} className={styles.backButton}>
          ←
        </button>
        <span className={styles.label}>{normalizedLabel}</span>
        <span className={styles.headerSpacer} />
      </div>

      <div className={styles.stage}>
        <div className={styles.revealBlock}>
          <CapLabel>Step 03 · Reveal</CapLabel>
          <div className={styles.segments}>
            {segments.map((segment, i) => {
              const active = i === cursor;
              const shown = active && visible;
              return (
                <div
                  key={i}
                  className={styles.segment}
                  data-state={getSegmentState(active, shown)}
                >
                  {shown ? segment : '•'.repeat(segment.length)}
                </div>
              );
            })}
          </div>
          <span className={styles.caption}>{caption}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => flash(cursor)}
          className={styles.secondaryButton}
          disabled={!started}
          aria-hidden={!started}
          data-visible={started}
        >
          Re-reveal segment
        </button>
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
