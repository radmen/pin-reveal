import { useEffect, useState } from 'preact/hooks';
import { type ApplyAppUpdate, subscribeToAppUpdate } from '../pwa-update';

export function useAppUpdate(): ApplyAppUpdate | null {
  const [applyAppUpdate, setApplyAppUpdate] = useState<ApplyAppUpdate | null>(
    null
  );

  useEffect(() => {
    let applyUpdate: ApplyAppUpdate = () => {};
    applyUpdate = subscribeToAppUpdate((): void => {
      setApplyAppUpdate(() => applyUpdate);
    });
  }, []);

  return applyAppUpdate;
}
