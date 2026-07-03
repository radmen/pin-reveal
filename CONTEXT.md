# Pin Reveal

Pin Reveal derives reproducible PINs from a passphrase, identity, and label without storing per-label secrets. The language below names the domain concepts that must stay stable across the app and its derivation rules.

## Language

**Derivation Contract**:
The frozen set of rules that turns credentials and a label into fingerprints and a PIN. It includes normalization, Argon2id parameters, HMAC messages, digit extraction, and fingerprint word lookup.
_Avoid_: algorithm, crypto flow, derive helper

**Key Persistence**:
The storage of the already-derived opaque master key for later use in the same app context. It is separate from the Derivation Contract because it does not define any derived values.
_Avoid_: credential storage, key cache

**In-memory Session**:
A session where the derived master key is usable only until the app is closed or refreshed because Key Persistence is unavailable or intentionally bypassed. Forgetting an in-memory session only clears the current in-memory key.
_Avoid_: temporary login, storage fallback

**Persisted Session**:
A session where the derived master key is available now and has also been stored by Key Persistence for later use in the same app context. Forgetting a persisted session must remove the persisted key.
_Avoid_: stored login, cached session

**Fingerprint Word List**:
The fixed ordered list used by the Derivation Contract to turn fingerprint bytes into recognition words. It is an integral part of the Derivation Contract, not standalone app content.
_Avoid_: vocabulary file, word data, word resource

**Saved Label**:
A remembered original label, normalized label, PIN length, and last-used time that Pin Reveal offers for reuse after the user enables label saving. Saved Labels are saved or updated by a post-reveal Vault save action, deduplicated by normalized label, sorted by most recent use, and can be removed, not edited.
_Avoid_: bookmark, favorite, saved PIN, scanned label

**Vault**:
The biometric-gated collection of Saved Labels. An enabled Vault retains Saved Labels and requires a biometric unlock each time the user wants to access them; a disabled Vault retains no Saved Labels.
_Avoid_: label history, saved-label storage, secure list

**Vault Unlock**:
A successful biometric passkey check that temporarily makes the Vault Key available. Unlock-to-select opens Saved Labels and keeps the Vault available for one selected label reveal, then locks after the post-reveal save or update; unlock-to-save saves or updates one revealed label that was not selected from the Vault, then locks immediately. Any unlocked Vault access expires after 60 seconds if it has not already locked.
_Avoid_: login, session, scan

**Vault Passkey**:
The WebAuthn credential created when the user enables the Vault. It is used for Vault Unlocks and to produce the material needed for the Vault Key.
_Avoid_: passcode, account passkey, login credential

**Vault Key**:
The encryption key derived from the Vault Passkey after a Vault Unlock. It encrypts and decrypts Saved Labels, and is separate from the master key used by the Derivation Contract.
_Avoid_: master key, passcode, biometric key
