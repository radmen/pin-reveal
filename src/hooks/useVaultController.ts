import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { normalizeLabel } from '../derivation-contract';
import {
  checkPrfSupport,
  createVaultPasskey,
  getVaultPrfOutput,
  VaultPasskeyCancelledError,
  VaultPasskeyError,
  VaultPasskeyNotSupportedError
} from '../vault-passkey.adapter';
import {
  decryptLabels,
  deriveVaultKey,
  encryptLabels,
  forgetVault,
  loadVaultCredential,
  loadVaultData,
  storeVaultCredential,
  storeVaultData,
  VaultPersistenceError
} from '../vault-persistence';
import type {
  SavedLabel,
  VaultPasskeyDiagnosticEvent,
  VaultPasskeyDiagnosticRecorder,
  VaultStatus
} from '../vault-types';

type UnlockedVault = {
  key: CryptoKey;
  labels: SavedLabel[];
};

const VAULT_UNLOCK_TIMEOUT_MS = 60_000;

function findVaultDiagnosticsEnabled(): boolean {
  if (import.meta.env.MODE !== 'production') {
    return true;
  }

  try {
    const searchParameters = new URLSearchParams(window.location.search);

    return (
      searchParameters.get('vault-debug') === '1' ||
      localStorage.getItem('pinderive.vaultDebug') === 'true'
    );
  } catch {
    return false;
  }
}

function updateSavedLabels(
  labels: SavedLabel[],
  label: string,
  pinLength: number
): SavedLabel[] {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    return labels;
  }

  return [
    {
      originalLabel: label,
      normalizedLabel,
      pinLength,
      lastUsedAt: Date.now()
    },
    ...labels.filter(
      (savedLabel) => savedLabel.normalizedLabel !== normalizedLabel
    )
  ];
}

export function useVaultController(): {
  status: VaultStatus;
  savedLabels: SavedLabel[];
  isBusy: boolean;
  isSaveBusy: boolean;
  isSaved: boolean;
  diagnosticsEnabled: boolean;
  diagnosticEvents: VaultPasskeyDiagnosticEvent[];
  diagnosticRunLabel: string;
  initializeStatus(): Promise<void>;
  reset(): void;
  enable(): Promise<void>;
  unlock(): Promise<void>;
  lock(): void;
  disable(): Promise<void>;
  removeLabel(label: SavedLabel): Promise<void>;
  saveUnlockedLabel(label: string, pinLength: number): Promise<void>;
  saveLabel(label: string, pinLength: number): Promise<void>;
  clearSavedState(): void;
  runDiagnostics(): Promise<void>;
} {
  const [status, setStatus] = useState<VaultStatus>('unavailable');
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [savedLabels, setSavedLabels] = useState<SavedLabel[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaveBusy, setIsSaveBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [diagnosticsEnabled] = useState(findVaultDiagnosticsEnabled);
  const [diagnosticEvents, setDiagnosticEvents] = useState<
    VaultPasskeyDiagnosticEvent[]
  >([]);

  const isRemovingLabelRef = useRef(false);

  useEffect(() => {
    if (status !== 'unlocked') {
      return;
    }

    const timer = setTimeout(() => {
      setVaultKey(null);
      setSavedLabels([]);
      setStatus('locked');
    }, VAULT_UNLOCK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [status]);

  const recordDiagnosticEvent = useCallback(
    (event: VaultPasskeyDiagnosticEvent): void => {
      setDiagnosticEvents((events) => [...events, event].slice(-50));
    },
    []
  );

  const findDiagnosticRecorder = useCallback(():
    VaultPasskeyDiagnosticRecorder | undefined => {
    return diagnosticsEnabled ? recordDiagnosticEvent : undefined;
  }, [diagnosticsEnabled, recordDiagnosticEvent]);

  function resetDiagnostics(): void {
    if (!diagnosticsEnabled) {
      return;
    }

    setDiagnosticEvents([]);
  }

  const initializeStatus = useCallback(async (): Promise<void> => {
    try {
      const supported = await checkPrfSupport(findDiagnosticRecorder());
      if (!supported) {
        setStatus('unavailable');
        return;
      }
      const credential = await loadVaultCredential();
      setStatus(credential ? 'locked' : 'unenrolled');
    } catch (error: unknown) {
      if (
        error instanceof VaultPersistenceError ||
        error instanceof VaultPasskeyError
      ) {
        setStatus('unavailable');
        return;
      }

      throw error;
    }
  }, [findDiagnosticRecorder]);

  async function performUnlock(): Promise<UnlockedVault> {
    const credential = await loadVaultCredential();
    if (!credential) {
      throw new Error('No vault credential found.');
    }
    const prfOutput = await getVaultPrfOutput(
      credential.credentialId,
      credential.prfSalt,
      findDiagnosticRecorder()
    );
    const key = await deriveVaultKey(prfOutput, credential.prfSalt);
    const data = await loadVaultData();
    const labels = data ? await decryptLabels(key, data) : [];
    return { key, labels };
  }

  function reset(): void {
    setVaultKey(null);
    setSavedLabels([]);
    setStatus('unavailable');
    setIsSaved(false);
    setIsSaveBusy(false);
    setIsBusy(false);
    setDiagnosticEvents([]);
  }

  function lock(): void {
    setVaultKey(null);
    setSavedLabels([]);
    setStatus('locked');
  }

  async function enable(): Promise<void> {
    resetDiagnostics();
    setIsBusy(true);
    try {
      const { credentialId, prfSalt, prfOutput } = await createVaultPasskey(
        findDiagnosticRecorder()
      );
      const key = await deriveVaultKey(prfOutput, prfSalt);
      const data = await encryptLabels(key, []);
      try {
        await storeVaultCredential({ credentialId, prfSalt });
        await storeVaultData(data);
      } catch (storageError: unknown) {
        await forgetVault();
        throw storageError;
      }
      setVaultKey(null);
      setSavedLabels([]);
      setStatus('locked');
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function unlock(): Promise<void> {
    resetDiagnostics();
    setIsBusy(true);
    try {
      const { key, labels } = await performUnlock();
      setVaultKey(key);
      setSavedLabels(labels);
      setStatus('unlocked');
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function disable(): Promise<void> {
    await forgetVault();
    setVaultKey(null);
    setSavedLabels([]);
    setStatus('unenrolled');
  }

  async function removeLabel(label: SavedLabel): Promise<void> {
    if (isRemovingLabelRef.current) {
      return;
    }
    if (!vaultKey || status !== 'unlocked') {
      return;
    }
    isRemovingLabelRef.current = true;
    try {
      const updated = savedLabels.filter(
        (savedLabel) => savedLabel.normalizedLabel !== label.normalizedLabel
      );
      const data = await encryptLabels(vaultKey, updated);
      await storeVaultData(data);
      setSavedLabels(updated);
    } finally {
      isRemovingLabelRef.current = false;
    }
  }

  async function saveUnlockedLabel(
    label: string,
    pinLength: number
  ): Promise<void> {
    if (!vaultKey || status !== 'unlocked') {
      return;
    }

    const updated = updateSavedLabels(savedLabels, label, pinLength);
    const data = await encryptLabels(vaultKey, updated);
    await storeVaultData(data);
    setIsSaved(true);
    lock();
  }

  async function saveLabel(label: string, pinLength: number): Promise<void> {
    const currentStatus = status;
    if (currentStatus !== 'locked' && currentStatus !== 'unlocked') {
      return;
    }

    resetDiagnostics();
    setIsSaveBusy(true);
    try {
      let key: CryptoKey;
      let labels: SavedLabel[];

      if (currentStatus === 'locked' || !vaultKey) {
        const unlocked = await performUnlock();
        key = unlocked.key;
        labels = unlocked.labels;
      } else {
        key = vaultKey;
        labels = savedLabels;
      }

      const updated = updateSavedLabels(labels, label, pinLength);
      if (updated !== labels) {
        const data = await encryptLabels(key, updated);
        await storeVaultData(data);
        setIsSaved(true);
        lock();
      }
    } catch (error: unknown) {
      if (error instanceof VaultPasskeyNotSupportedError) {
        setStatus('unavailable');
        return;
      }

      if (error instanceof VaultPasskeyCancelledError) {
        return;
      }

      throw error;
    } finally {
      setIsSaveBusy(false);
    }
  }

  function clearSavedState(): void {
    setIsSaved(false);
  }

  const diagnosticRunLabel =
    status === 'locked' || status === 'unlocked'
      ? 'Run unlock check'
      : 'Try enabling Vault';
  const runDiagnostics =
    status === 'locked' || status === 'unlocked' ? unlock : enable;

  return {
    status,
    savedLabels,
    isBusy,
    isSaveBusy,
    isSaved,
    diagnosticsEnabled,
    diagnosticEvents,
    diagnosticRunLabel,
    initializeStatus,
    reset,
    enable,
    unlock,
    lock,
    disable,
    removeLabel,
    saveUnlockedLabel,
    saveLabel,
    clearSavedState,
    runDiagnostics
  };
}
