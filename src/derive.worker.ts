import { deriveKey } from './derivation-contract';

type DeriveKeyWorkerRequest = {
  password: string;
  username: string;
};

self.onmessage = async (event: MessageEvent<DeriveKeyWorkerRequest>) => {
  const key = await deriveKey(event.data.password, event.data.username);
  (self as unknown as Worker).postMessage(key);
};
