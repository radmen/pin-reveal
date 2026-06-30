import { afterEach, describe, expect, it } from 'vitest';
import * as keyDerivationAdapter from './derive-key.adapter';

type PostedMessage = {
  password: string;
  username: string;
};

type WorkerOptions = ConstructorParameters<typeof Worker>[1];

const originalWorker = globalThis.Worker;

class FakeWorker {
  static instances: FakeWorker[] = [];

  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<CryptoKey>) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postedMessage: PostedMessage | null = null;
  terminated = false;

  constructor(
    readonly url: URL,
    readonly options?: WorkerOptions
  ) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: PostedMessage): void {
    this.postedMessage = message;
  }

  terminate(): void {
    this.terminated = true;
  }
}

function installFakeWorker(): void {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
}

afterEach((): void => {
  globalThis.Worker = originalWorker;
});

describe('derive key adapter', (): void => {
  it('exports only the key derivation operation', (): void => {
    expect(Object.keys(keyDerivationAdapter)).toEqual(['deriveKey']);
  });

  it('posts derivation inputs and terminates on success', async (): Promise<void> => {
    installFakeWorker();

    const key = {} as CryptoKey;
    const promise = keyDerivationAdapter.deriveKey('password', 'username');
    const worker = FakeWorker.instances[0];

    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.postedMessage).toEqual({
      password: 'password',
      username: 'username'
    });

    worker.onmessage?.({ data: key } as MessageEvent<CryptoKey>);

    await expect(promise).resolves.toBe(key);
    expect(worker.terminated).toBe(true);
  });

  it('terminates on failure', async (): Promise<void> => {
    installFakeWorker();

    const error = new Error('boom');
    const promise = keyDerivationAdapter.deriveKey('password', 'username');
    const worker = FakeWorker.instances[0];

    worker.onerror?.({ error } as ErrorEvent);

    await expect(promise).rejects.toBe(error);
    expect(worker.terminated).toBe(true);
  });
});
