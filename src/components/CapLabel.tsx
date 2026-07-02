import type { ComponentChildren, JSX } from 'preact';
import styles from './CapLabel.module.css';

interface CapLabelProps {
  children: ComponentChildren;
}

export function CapLabel({ children }: CapLabelProps): JSX.Element {
  return <span className={styles.label}>{children}</span>;
}
