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

export type VaultPasskeyDiagnosticEvent = {
  step: string;
  details: unknown;
};

export type VaultPasskeyDiagnosticRecorder = (
  event: VaultPasskeyDiagnosticEvent
) => void;

type PrfExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
};

type PublicKeyCredentialApi = {
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
};

function toDiagnosticValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: value.byteLength };
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView & { length?: number };

    return {
      type: view.constructor.name,
      byteLength: view.byteLength,
      length: view.length ?? null
    };
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toDiagnosticValue(item, seen));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [key, toDiagnosticValue(nestedValue, seen)]
    )
  );
}

function recordDiagnosticEvent(
  recorder: VaultPasskeyDiagnosticRecorder | undefined,
  step: string,
  details: unknown
): void {
  if (!recorder) {
    return;
  }

  recorder({
    step,
    details: toDiagnosticValue(details)
  });
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return { value: String(error) };
}

function getWebAuthnEnvironment(): Record<string, unknown> {
  return {
    hasWindow: typeof window !== 'undefined',
    isSecureContext:
      typeof window !== 'undefined' ? window.isSecureContext : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    hasPublicKeyCredential:
      typeof window !== 'undefined' && !!window.PublicKeyCredential,
    hasCredentialCreate:
      typeof navigator !== 'undefined' && !!navigator.credentials?.create,
    hasCredentialGet:
      typeof navigator !== 'undefined' && !!navigator.credentials?.get
  };
}

async function recordPlatformAuthenticatorAvailability(
  publicKeyCredential: PublicKeyCredentialApi,
  recordDiagnostic: VaultPasskeyDiagnosticRecorder | undefined
): Promise<void> {
  if (
    !recordDiagnostic ||
    !publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return;
  }

  try {
    const platformAuthenticatorAvailable =
      await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    recordDiagnosticEvent(recordDiagnostic, 'support.platform-authenticator', {
      available: platformAuthenticatorAvailable
    });
  } catch (error: unknown) {
    recordDiagnosticEvent(
      recordDiagnostic,
      'support.platform-authenticator-error',
      getErrorDetails(error)
    );
  }
}

function isWebAuthnCancelError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotAllowedError';
}

function isWebAuthnUnsupportedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NotSupportedError' || error.name === 'SecurityError')
  );
}

export async function checkPrfSupport(
  recordDiagnostic?: VaultPasskeyDiagnosticRecorder
): Promise<boolean> {
  try {
    recordDiagnosticEvent(
      recordDiagnostic,
      'support.environment',
      getWebAuthnEnvironment()
    );

    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      !navigator.credentials?.create ||
      !navigator.credentials?.get
    ) {
      recordDiagnosticEvent(recordDiagnostic, 'support.result', {
        supported: false,
        reason: 'missing-webauthn-api'
      });

      return false;
    }

    const publicKeyCredential =
      PublicKeyCredential as unknown as PublicKeyCredentialApi;

    if (publicKeyCredential.getClientCapabilities) {
      const capabilities = await publicKeyCredential.getClientCapabilities();
      recordDiagnosticEvent(
        recordDiagnostic,
        'support.client-capabilities',
        capabilities
      );

      if (typeof capabilities['extension:prf'] === 'boolean') {
        await recordPlatformAuthenticatorAvailability(
          publicKeyCredential,
          recordDiagnostic
        );
        recordDiagnosticEvent(recordDiagnostic, 'support.result', {
          supported: capabilities['extension:prf'],
          reason: 'client-capability-extension-prf'
        });

        return capabilities['extension:prf'];
      }
    }

    if (publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      const platformAuthenticatorAvailable =
        await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      recordDiagnosticEvent(
        recordDiagnostic,
        'support.platform-authenticator',
        { available: platformAuthenticatorAvailable }
      );
      recordDiagnosticEvent(recordDiagnostic, 'support.result', {
        supported: platformAuthenticatorAvailable,
        reason: 'platform-authenticator-fallback'
      });

      return platformAuthenticatorAvailable;
    }

    recordDiagnosticEvent(recordDiagnostic, 'support.result', {
      supported: true,
      reason: 'webauthn-api-present'
    });

    return true;
  } catch (error: unknown) {
    recordDiagnosticEvent(
      recordDiagnostic,
      'support.error',
      getErrorDetails(error)
    );

    return false;
  }
}

export async function createVaultPasskey(
  recordDiagnostic?: VaultPasskeyDiagnosticRecorder
): Promise<VaultPasskeyCreation> {
  recordDiagnosticEvent(
    recordDiagnostic,
    'create.environment',
    getWebAuthnEnvironment()
  );

  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.create
  ) {
    recordDiagnosticEvent(recordDiagnostic, 'create.result', {
      supported: false,
      reason: 'missing-webauthn-create-api'
    });

    throw new VaultPasskeyNotSupportedError();
  }

  const prfSalt = crypto.getRandomValues(new Uint8Array(32));

  let credential: PublicKeyCredential;
  try {
    recordDiagnosticEvent(recordDiagnostic, 'create.request', {
      authenticatorAttachment: 'platform',
      residentKey: 'discouraged',
      userVerification: 'required',
      hasPrfEval: true
    });

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
  } catch (error: unknown) {
    recordDiagnosticEvent(
      recordDiagnostic,
      'create.error',
      getErrorDetails(error)
    );

    if (isWebAuthnCancelError(error)) {
      throw new VaultPasskeyCancelledError();
    }

    if (isWebAuthnUnsupportedError(error)) {
      throw new VaultPasskeyNotSupportedError();
    }

    throw new VaultPasskeyError(error);
  }

  if (!credential) {
    recordDiagnosticEvent(recordDiagnostic, 'create.result', {
      supported: false,
      reason: 'no-credential-returned'
    });

    throw new VaultPasskeyError(new Error('No credential returned.'));
  }

  const credentialId = new Uint8Array(credential.rawId);
  const extensionResults =
    credential.getClientExtensionResults() as PrfExtensionResults;
  const rawOutput = extensionResults.prf?.results?.first;
  recordDiagnosticEvent(
    recordDiagnostic,
    'create.extension-results',
    extensionResults
  );

  if (rawOutput) {
    recordDiagnosticEvent(recordDiagnostic, 'create.result', {
      supported: true,
      reason: 'create-prf-output',
      prfOutputByteLength: rawOutput.byteLength
    });

    return {
      credentialId,
      prfSalt,
      prfOutput: new Uint8Array(rawOutput)
    };
  }

  if (!extensionResults.prf?.enabled) {
    recordDiagnosticEvent(recordDiagnostic, 'create.result', {
      supported: false,
      reason: 'create-prf-not-enabled',
      enabled: extensionResults.prf?.enabled ?? null
    });

    throw new VaultPasskeyNotSupportedError();
  }

  recordDiagnosticEvent(recordDiagnostic, 'create.fallback-to-assertion', {
    reason: 'create-prf-enabled-without-output'
  });

  const prfOutput = await getVaultPrfOutput(
    credentialId,
    prfSalt,
    recordDiagnostic
  );

  recordDiagnosticEvent(recordDiagnostic, 'create.result', {
    supported: true,
    reason: 'assertion-prf-output',
    prfOutputByteLength: prfOutput.byteLength
  });

  return {
    credentialId,
    prfSalt,
    prfOutput
  };
}

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    ''
  );

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export async function getVaultPrfOutput(
  credentialId: Uint8Array<ArrayBuffer>,
  prfSalt: Uint8Array<ArrayBuffer>,
  recordDiagnostic?: VaultPasskeyDiagnosticRecorder
): Promise<Uint8Array<ArrayBuffer>> {
  recordDiagnosticEvent(
    recordDiagnostic,
    'assertion.environment',
    getWebAuthnEnvironment()
  );

  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.get
  ) {
    recordDiagnosticEvent(recordDiagnostic, 'assertion.result', {
      supported: false,
      reason: 'missing-webauthn-get-api'
    });

    throw new VaultPasskeyNotSupportedError();
  }

  let assertion: PublicKeyCredential;
  try {
    recordDiagnosticEvent(recordDiagnostic, 'assertion.request', {
      allowCredentialByteLength: credentialId.byteLength,
      usesEvalByCredential: true,
      userVerification: 'required'
    });

    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        extensions: {
          prf: {
            evalByCredential: {
              [toBase64Url(credentialId)]: { first: prfSalt }
            }
          }
        } as AuthenticationExtensionsClientInputs,
        timeout: 60000
      }
    });
    assertion = result as PublicKeyCredential;
  } catch (error: unknown) {
    recordDiagnosticEvent(
      recordDiagnostic,
      'assertion.error',
      getErrorDetails(error)
    );

    if (isWebAuthnCancelError(error)) {
      throw new VaultPasskeyCancelledError();
    }

    if (isWebAuthnUnsupportedError(error)) {
      throw new VaultPasskeyNotSupportedError();
    }

    throw new VaultPasskeyError(error);
  }

  if (!assertion) {
    recordDiagnosticEvent(recordDiagnostic, 'assertion.result', {
      supported: false,
      reason: 'no-assertion-returned'
    });

    throw new VaultPasskeyError(new Error('No assertion returned.'));
  }

  const extensionResults =
    assertion.getClientExtensionResults() as PrfExtensionResults;
  const rawOutput = extensionResults.prf?.results?.first;
  recordDiagnosticEvent(
    recordDiagnostic,
    'assertion.extension-results',
    extensionResults
  );

  if (!rawOutput) {
    recordDiagnosticEvent(recordDiagnostic, 'assertion.result', {
      supported: false,
      reason: 'assertion-prf-output-missing'
    });

    throw new VaultPasskeyNotSupportedError();
  }

  recordDiagnosticEvent(recordDiagnostic, 'assertion.result', {
    supported: true,
    reason: 'assertion-prf-output',
    prfOutputByteLength: rawOutput.byteLength
  });

  return new Uint8Array(rawOutput);
}
