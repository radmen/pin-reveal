import type { JSX } from 'preact';
import styles from './Skeleton.module.css';

type SkeletonStyle = JSX.CSSProperties & {
  '--skeleton-width': string;
  '--skeleton-height': string;
};

interface SkeletonProps {
  width: string;
  height: string;
}

export function Skeleton({ width, height }: SkeletonProps): JSX.Element {
  return (
    <div
      className={styles.skeleton}
      style={
        {
          '--skeleton-width': width,
          '--skeleton-height': height
        } as SkeletonStyle
      }
    />
  );
}
