import type { ComponentChildren, JSX } from 'preact';

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
      onClick={onClick}
      style={{
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
      }}
    >
      {children}
    </button>
  );
}
