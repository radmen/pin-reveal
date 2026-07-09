# Pin Reveal

Pin Reveal turns one passphrase into every PIN you need. It **derives**
reproducible PINs from a passphrase, an identity, and a label — deterministically,
on-device, storing **no per-label secrets**. Type the same three inputs on any
device and you get the same PINs back; there is nothing to sync, back up, or leak.

It runs entirely in the browser as an installable, offline-capable PWA.

## How it works

There is no account and nothing to authenticate. The "login" screen simply
**seeds** a derivation:

- **`password`** → the passphrase. The only secret, and the sole source of entropy.
- **`username`** → the salt. Non-secret; makes the derived key unique per identity.

From there the derivation is a fixed two-step chain:

```
password ──Argon2id(salt = username)──▶ master key (32 bytes, non-extractable)
                                          ├─ HMAC "login|v1"            ─▶ 2 words   (credential check)
                                          ├─ HMAC "fp|v1|" + label      ─▶ 2 words   (label check)
                                          └─ HMAC "pin|v1|" + len+label ─▶ PIN digits
```

1. **Master key** — `Argon2id` (memory-hard) stretches the passphrase once per
   session. This is the brute-force barrier.
2. **Per-label PINs** — `HMAC-SHA256` off the master key is fast, and runs every
   time you reveal a PIN. PIN length (4 / 6 / 8) is part of the message, so each
   length is an independent stream.

Because nothing is stored to check against, **the login never rejects** — a wrong
passphrase silently yields wrong PINs. The two-word **fingerprints** are the only
signal that you typed the right inputs:

- The **login fingerprint** (shown after the key is derived) confirms the
  `username` / `password` pair.
- The **label fingerprint** (shown as you type a label) catches typos, look-alikes,
  and naming drift before you rely on the PIN.

Fingerprints are recognition checks — read them like SSH randomart. They are
derived from the master *key* (never from the raw text), so they leak nothing an
attacker couldn't already get only by paying a full Argon2id pass.

The complete, frozen derivation contract — every parameter, message format, and
normalization rule — is specified in
[`docs/pin-derivation-spec.md`](docs/pin-derivation-spec.md). Treat every
value there as immutable: changing any of them re-derives every PIN.

## The Vault (optional)

By default nothing about your labels is persisted. If you opt in, the **Vault**
remembers labels for reuse, gated behind a **WebAuthn/biometric passkey**. Saved
labels are encrypted with a key derived from that passkey, and each access
requires a fresh unlock. See the ADRs in [`docs/adr/`](docs/adr/) for the design
decisions behind the Vault and key persistence.

## Security posture

- **Your ceiling is passphrase entropy.** Argon2id only buys time against
  guessing; it cannot manufacture entropy a weak passphrase lacks. Use several
  words.
- **The master key is stored as a non-extractable WebCrypto `CryptoKey`** in
  IndexedDB. JavaScript can *use* it but cannot read its bytes, so XSS can't
  exfiltrate it. Raw key bytes are zeroed immediately after derivation.
- **No PIN is ever stored.** Nothing reversible to a PIN is written to disk.
- **Labels are selectors, not secrets.** They choose *which* PIN; they provide no
  protection.

This is a personal-scale tool, not a hardware security module. Read
[the spec's §8 security analysis](docs/pin-derivation-spec.md) for the honest
trade-offs.

## Tech stack

- [Preact](https://preactjs.com/) + TypeScript
- [Vite](https://vitejs.dev/) with [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (offline / installable)
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) for Argon2id; WebCrypto for HMAC, key storage, and WebAuthn
- [Vitest](https://vitest.dev/) + Testing Library for tests

## Getting started

Requires **Node.js 22+**.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (Vite)
```

Open the printed local URL. Note: IndexedDB-backed key persistence and the Vault
require a real browser origin — they will not work inside sandboxed preview
frames.

## Scripts

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `npm run dev`      | Start the Vite dev server                            |
| `npm run build`    | Type-check (`tsc --noEmit`) and build for production |
| `npm run preview`  | Serve the production build locally                   |
| `npm test`         | Run the test suite once (Vitest)                     |
| `npm run lint`     | Lint with ESLint                                     |
| `npm run format`   | Format with Prettier                                 |

A Husky pre-commit hook runs `lint-staged` (Prettier) on staged files. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, tests, and
build on every push to `main` and every pull request.

## Project structure

```
src/
├── derivation-contract/   # the frozen derivation contract (Argon2id + HMAC + word list)
├── screens/               # Login, Label, Reveal, Vault screens
├── components/            # shared UI (topbar, banners, buttons, drawer)
├── hooks/                 # session, vault, theme, and app-update hooks
├── app-flow.ts            # navigation/flow reducer
├── vault-*.ts             # Vault persistence, passkey, and types
└── key-persistence.ts     # non-extractable master-key storage
docs/
├── pin-derivation-spec.md   # the frozen derivation spec (read this first)
├── adr/                     # architecture decision records
└── agents/                  # agent/triage conventions
CONTEXT.md                   # domain glossary — the canonical vocabulary
```

## Documentation

- [`docs/pin-derivation-spec.md`](docs/pin-derivation-spec.md) — the frozen derivation contract.
- [`CONTEXT.md`](CONTEXT.md) — domain glossary; use these terms when contributing.
- [`docs/adr/`](docs/adr/) — architecture decision records.

## Contributing

Issues are tracked in [GitHub Issues](https://github.com/radmen/pin-reveal/issues).
When you touch the derivation, remember the contract is frozen — the fixtures in
`src/derivation-contract.test.ts` guard it, and any change is a hard fork that
forces manual PIN rotation. Please match the vocabulary defined in `CONTEXT.md`.
