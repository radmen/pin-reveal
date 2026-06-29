import type { ComponentChildren, JSX } from 'preact';

interface CapLabelProps {
  children: ComponentChildren;
}

export function CapLabel({ children }: CapLabelProps): JSX.Element {
  return (
    <span
      style={{
        fontFamily: "'Space Mono',monospace",
        fontSize: '10px',
        letterSpacing: '2px',
        color: 'var(--faint)',
        textTransform: 'uppercase'
      }}
    >
      {children}
    </span>
  );
}
