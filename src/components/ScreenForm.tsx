import type { ComponentChildren, JSX } from 'preact';
import styles from './ScreenForm.module.css';

interface ScreenFormProps {
  children: ComponentChildren;
  onSubmit(event: JSX.TargetedSubmitEvent<HTMLFormElement>): void;
}

interface ScreenHeaderProps {
  eyebrow: ComponentChildren;
  title: string;
  intro?: ComponentChildren;
}

export function ScreenForm({
  children,
  onSubmit
}: ScreenFormProps): JSX.Element {
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {children}
    </form>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  intro
}: ScreenHeaderProps): JSX.Element {
  return (
    <div className={styles.header}>
      {eyebrow}
      <h1 className={styles.heading}>{title}</h1>
      {intro && <p className={styles.intro}>{intro}</p>}
    </div>
  );
}
