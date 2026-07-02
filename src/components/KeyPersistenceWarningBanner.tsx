import type { JSX } from 'preact';
import {
  ForgetKeyError,
  LoadKeyError,
  StoreKeyError
} from '../key-persistence';
import { AppBanner } from './AppBanner';
import styles from './BannerContent.module.css';

type KeyPersistenceWarning = {
  userMessage: string;
  message: string;
  causeMessage: string | null;
};

export type KeyPersistenceError = LoadKeyError | StoreKeyError | ForgetKeyError;

function findCauseMessage(error: Error): string | null {
  if (!error.cause) {
    return null;
  }

  if (error.cause instanceof Error) {
    return error.cause.message;
  }

  return String(error.cause);
}

function getKeyPersistenceWarning(
  error: KeyPersistenceError
): KeyPersistenceWarning {
  if (error instanceof LoadKeyError) {
    return {
      userMessage: 'Your saved key could not be loaded.',
      message: error.message,
      causeMessage: findCauseMessage(error)
    };
  }

  if (error instanceof StoreKeyError) {
    return {
      userMessage: 'Your key could not be saved for next time.',
      message: error.message,
      causeMessage: findCauseMessage(error)
    };
  }

  return {
    userMessage: 'Your saved key could not be forgotten.',
    message: error.message,
    causeMessage: findCauseMessage(error)
  };
}

export function KeyPersistenceWarningBanner({
  error,
  onDismiss
}: {
  error: KeyPersistenceError | null;
  onDismiss(): void;
}): JSX.Element | null {
  if (!error) {
    return null;
  }

  const warning = getKeyPersistenceWarning(error);

  return (
    <AppBanner role="alert" tone="warning">
      <div className={styles.content}>
        <div>
          <strong className={styles.title}>{warning.userMessage}</strong>
          You can still derive your key and continue using the app.
        </div>
        <button
          aria-label="Dismiss warning"
          onClick={onDismiss}
          className={styles.dismissButton}
        >
          x
        </button>
      </div>
      <details className={styles.details}>
        <summary className={styles.summary}>Technical details</summary>
        <div className={styles.technicalDetails}>
          <div>{warning.message}</div>
          {warning.causeMessage && <div>{warning.causeMessage}</div>}
        </div>
      </details>
    </AppBanner>
  );
}
