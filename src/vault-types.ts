export type VaultStatus = 'unavailable' | 'unenrolled' | 'locked' | 'unlocked';

export type SavedLabel = {
  originalLabel: string;
  normalizedLabel: string;
  pinLength: number;
  lastUsedAt: number;
};

export type VaultPasskeyDiagnosticEvent = {
  step: string;
  details: unknown;
};

export type VaultPasskeyDiagnosticRecorder = (
  event: VaultPasskeyDiagnosticEvent
) => void;
