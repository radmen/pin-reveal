# Vault Labels Use Biometric-Gated Encryption Key

Saved Labels are local-only Vault data and must be encrypted with a Vault encryption key derived from WebAuthn PRF output after successful user verification. They must not be encrypted directly with the persisted master key, because a Persisted Session can make the master key usable without a fresh biometric scan while the Vault must reveal nothing until the user unlocks it. Devices or browsers without WebAuthn PRF support cannot enable the first Vault version.
