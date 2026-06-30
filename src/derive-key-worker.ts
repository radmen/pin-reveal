type DeriveKeyWorkerRequest = {
  password: string;
  username: string;
};

function workerErrorFrom(event: ErrorEvent): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'Key derivation worker failed');
}

export function deriveKey(
  password: string,
  username: string
): Promise<CryptoKey> {
  return new Promise<CryptoKey>((resolve, reject) => {
    const worker = new Worker(new URL('./derive.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (event: MessageEvent<CryptoKey>) => {
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(workerErrorFrom(event));
    };

    worker.onmessageerror = () => {
      worker.terminate();
      reject(
        new Error('Key derivation worker returned an unreadable response')
      );
    };

    const request: DeriveKeyWorkerRequest = { password, username };
    worker.postMessage(request);
  });
}
