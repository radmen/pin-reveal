import { registerSW } from 'virtual:pwa-register';

export type ApplyAppUpdate = () => void;

export function subscribeToAppUpdate(
  onUpdateReady: () => void
): ApplyAppUpdate {
  const applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh(): void {
      onUpdateReady();
    }
  });

  return (): void => {
    void applyUpdate(true);
  };
}
