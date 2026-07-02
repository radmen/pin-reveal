import type { JSX } from 'preact';
import {
  ForgetKeyError,
  LoadKeyError,
  StoreKeyError
} from '../key-persistence';

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
    <div
      role="alert"
      style={{
        margin: '14px 18px 0',
        padding: '13px 14px',
        border: '1px solid #f59e0b',
        borderRadius: '13px',
        background: 'rgba(245, 158, 11, .12)',
        color: 'var(--fg)',
        fontSize: '12.5px',
        lineHeight: '1.45'
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <strong style={{ display: 'block', marginBottom: '4px' }}>
            {warning.userMessage}
          </strong>
          You can still derive your key and continue using the app.
        </div>
        <button
          aria-label="Dismiss warning"
          onClick={onDismiss}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: 0
          }}
        >
          x
        </button>
      </div>
      <details style={{ marginTop: '9px' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>
          Technical details
        </summary>
        <div
          style={{
            marginTop: '8px',
            fontFamily: "'Space Mono',monospace",
            color: 'var(--muted)'
          }}
        >
          <div>{warning.message}</div>
          {warning.causeMessage && <div>{warning.causeMessage}</div>}
        </div>
      </details>
    </div>
  );
}
