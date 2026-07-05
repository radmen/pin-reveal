export class VaultPasskeyError extends Error {
  constructor(cause: unknown) {
    super('Vault Passkey operation failed.', { cause });
    this.name = 'VaultPasskeyError';
  }
}

export class VaultPasskeyNotSupportedError extends Error {
  constructor() {
    super('WebAuthn PRF is not supported on this device or browser.');
    this.name = 'VaultPasskeyNotSupportedError';
  }
}

export class VaultPasskeyCancelledError extends Error {
  constructor() {
    super('Vault Passkey operation was cancelled.');
    this.name = 'VaultPasskeyCancelledError';
  }
}

export type VaultPasskeyCreation = {
  credentialId: Uint8Array<ArrayBuffer>;
  prfSalt: Uint8Array<ArrayBuffer>;
  prfOutput: Uint8Array<ArrayBuffer>;
};

export async function checkPrfSupport(): Promise<boolean> {
  try {
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      !navigator.credentials
    ) {
      return false;
    }
    if (
      !(
        'getClientCapabilities' in
        (PublicKeyCredential as unknown as Record<string, unknown>)
      )
    ) {
      return false;
    }

    const caps = await (
      PublicKeyCredential as unknown as {
        getClientCapabilities(): Promise<Record<string, boolean>>;
      }
    ).getClientCapabilities();
    return !!caps['prf'];
  } catch {
    return false;
  }
}

export async function createVaultPasskey(): Promise<VaultPasskeyCreation> {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.create
  ) {
    throw new VaultPasskeyNotSupportedError();
  }

  const prfSalt = crypto.getRandomValues(new Uint8Array(32));

  let credential: PublicKeyCredential;
  try {
    const result = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'pin·derive' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'vault',
          displayName: 'Label Vault'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged'
        },
        extensions: {
          prf: { eval: { first: prfSalt } }
        } as AuthenticationExtensionsClientInputs,
        timeout: 60000
      }
    });
    credential = result as PublicKeyCredential;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new VaultPasskeyCancelledError();
    }
    throw new VaultPasskeyError(error);
  }

  if (!credential) {
    throw new VaultPasskeyError(new Error('No credential returned.'));
  }

  const extensionResults = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const rawOutput = extensionResults.prf?.results?.first;

  if (!rawOutput) {
    throw new VaultPasskeyNotSupportedError();
  }

  return {
    credentialId: new Uint8Array(credential.rawId),
    prfSalt,
    prfOutput: new Uint8Array(rawOutput)
  };
}

export async function getVaultPrfOutput(
  credentialId: Uint8Array<ArrayBuffer>,
  prfSalt: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.get
  ) {
    throw new VaultPasskeyNotSupportedError();
  }

  let assertion: PublicKeyCredential;
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        extensions: {
          prf: { eval: { first: prfSalt } }
        } as AuthenticationExtensionsClientInputs,
        timeout: 60000
      }
    });
    assertion = result as PublicKeyCredential;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new VaultPasskeyCancelledError();
    }
    throw new VaultPasskeyError(error);
  }

  if (!assertion) {
    throw new VaultPasskeyError(new Error('No assertion returned.'));
  }

  const extensionResults = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const rawOutput = extensionResults.prf?.results?.first;

  if (!rawOutput) {
    throw new VaultPasskeyNotSupportedError();
  }

  return new Uint8Array(rawOutput);
}
