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
