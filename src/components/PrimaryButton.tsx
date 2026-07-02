import type { ComponentChildren, JSX } from 'preact';
import styles from './PrimaryButton.module.css';

interface PrimaryButtonProps {
  children: ComponentChildren;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export function PrimaryButton({
  children,
  disabled = false,
  onClick,
  type = 'button'
}: PrimaryButtonProps): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={styles.button}
    >
      {children}
    </button>
  );
}
