import { deriveKey } from './derive';

self.onmessage = async (
  event: MessageEvent<{ password: string; username: string }>
) => {
  const key = await deriveKey(event.data.password, event.data.username);
  (self as unknown as Worker).postMessage(key);
};
