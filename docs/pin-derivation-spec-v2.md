# Deterministic PIN Derivation — App-Assisted Spec

**Version:** 2.0 (`derivation contract = v1`)
**Status:** Frozen draft
**Date:** 2026-06-26
**Supersedes:** the head-computable mnemonic recurrence (v1.x). That scheme
existed only to stay mental-arithmetic-friendly; with an app doing the work it
is replaced wholesale by standard primitives.

---

## 0. The freeze notice (read first)

Every value in **§3–§6** is part of an immutable derivation contract. The chain is:

```
password ──Argon2id(salt=username)──▶ master key
                                       ├─HMAC "login|v1" ─▶ 2 words  (credential check)
                                       ├─HMAC "fp|v1|"+label ─▶ 2 words  (label check)
                                       └─HMAC "pin|v1|"+label ─▶ reject+mod10 ─▶ PIN
```

Changing **any** link — Argon2id parameters, the salt rule, the HMAC message
format, the normalization function, the digit-extraction rule, the word
list — silently changes the output for **every** label.

Because this app is **stateless** (it stores only the master key, nothing
per-account), there is no per-account record of "which contract version made
this PIN." Therefore:

- There is **no in-place upgrade.** A contract change is a hard fork.
- A new version (`v2`) will **not** regenerate `v1`'s PINs, and cannot be made to.
- The only migration is **manual rotation**: derive the new PIN and change it at
  each service by hand, one at a time — the same effort as rotating a leaked PIN.

Conclusion: pick the contract correctly **once**. Treat the version tag `v1`
below as a namespace, not an upgrade path.

---

## 1. Architecture

The two inputs are presented as a **login** — `username` and `password` — but no
credential is stored or checked. The pair simply *seeds* the derivation:

- `password` → the passphrase (the only secret, the sole root of entropy)
- `username` → the salt (non-secret; makes the master key unique per identity)

| Step | Function | Cost | When it runs |
|------|----------|------|--------------|
| 1. Master key | `Argon2id(password, salt=username)` | slow (memory-hard) | once per session / at login |
| 2. Per-label  | `HMAC-SHA256(master_key, message)` | fast | every time you ask for a PIN |

The **master key** is the high-entropy output of step 1. If cached at rest it
must be protected by the OS keychain / biometric (see §8).

The **label** ("visa", "front-door") is a non-secret **selector**. It chooses
*which* PIN; it provides no security. Anyone with the unlocked app can try every
label — fine, because the master key, not the label, is the strength.

> **This login never rejects.** With nothing stored to compare against, *every*
> username/password pair "succeeds" and produces a full set of plausible-looking
> PINs. A wrong password yields wrong PINs with **no error**. The login
> fingerprint (§7) is therefore not a nicety — it is the *only* signal that you
> entered the right pair. Treat it as the login check it replaces.

---

## 2. Primitives

| Role | Primitive | Notes |
|------|-----------|-------|
| KDF (key stretch) | **Argon2id** | memory-hard; the actual brute-force barrier |
| PRF (per-label)   | **HMAC-SHA256** | fast; key is already high-entropy |
| Hash              | **SHA-256** | inside HMAC and Argon2 |

Do not substitute a fast hash for Argon2id in step 1, and do not add a second
slow KDF in step 2 — once the key is high-entropy, HMAC is sufficient and fast.

---

## 3. Step 1 — Master key (Argon2id)

```
master_key = Argon2id(
    password = utf8(password),
    salt     = utf8("pinapp|v1|salt|" + normalize(username)),
    t (iterations)  = 3,
    m (memory KiB)  = 65536,        # 64 MiB
    p (parallelism) = 1,
    dkLen           = 32            # 32-byte master key
)
```

### Salt = username (must be reproducible)

The salt is the **username**, normalized with the §5 function. A random
per-install salt would be lost on device loss and break recover-from-memory, so
the salt must come from something you re-type: the username is exactly that.

- Trade-off: a memorized identifier is not high-entropy, so it doesn't defend
  against a precomputed attack the way a random salt would. At this stakes level,
  and given the passphrase carries the real entropy, this is acceptable.
- Simpler alternative: a single fixed constant salt baked into the spec. Fully
  stateless, but identical across all users — only safe if passphrases are strong.
  **Default: identifier-derived salt.**

### Parameter tuning

`m=64 MiB, t=3, p=1` is a sane interactive default for a phone (≈ OWASP guidance).
Raise `m` on desktop-class hardware if you can tolerate the latency. **Whatever
you choose is frozen** — raising it later re-derives every key.

---

## 4. Step 2 — Per-label HMAC

Three **domain-separated** messages off the same master key, so no derivation
can reveal anything about another:

```
pin_bytes_n  = HMAC-SHA256(master_key, "pin|v1|" + label [+ "|" + n])
fp_bytes     = HMAC-SHA256(master_key, "fp|v1|"  + label)
login_bytes  = HMAC-SHA256(master_key, "login|v1")
```

- `pin|`   → the PIN digits (§6).
- `fp|`    → the per-label fingerprint, two words (§7).
- `login|` → the credential fingerprint, two words (§7). Note it takes **no
  label** — it is a property of the username/password pair alone.

- `label` is the **normalized** selector (§5).
- `|` is a safe delimiter: normalized labels are `[a-z0-9-]`, so `|` cannot
  appear inside one (no ambiguity / injection across fields).
- `v1` is the contract namespace. If you ever add per-account state and want a
  second contract to coexist, bump it; otherwise it never changes.
- `n` is a counter used only if the first 32 bytes run dry (§6), starting unset
  then `1, 2, …`.

---

## 5. Label normalization (frozen, `normalization = v1`)

Order is load-bearing. Do not reorder.

1. **NFC** — resolve composed/decomposed encoding (e.g. `ó` precomposed vs `o`+◌́).
2. **Lowercase** — Unicode-default / locale-invariant (no Turkish-I surprise).
3. **Fold non-decomposing letters** — explicit map: `ł→l`, `ø→o`, `đ→d`
   (these have no combining mark for step 4 to strip).
4. **NFKD + drop combining marks** — folds `ą ę ć ń ó ś ź ż` → `a e c n o s z z`.
5. **Whitespace → dash** — trim ends, collapse runs of whitespace to a single `-`.
6. **Strip** — remove anything not in `[a-z0-9-]`.
7. **Collapse dashes** — runs of `-` → one; trim leading/trailing `-`.

Result charset: `[a-z0-9-]`.

Worked results:

| input | output |
|-------|--------|
| `Visa` / `VISA` | `visa` |
| `  Front  Door  ` | `front-door` |
| `work phone` | `work-phone` |
| `Poczta Główna` | `poczta-glowna` |
| `Główna` | `glowna`  *(not `gowna` — that's the bug if you strip instead of fold)* |
| `AT&T` | `att` |
| `Mr. Smith` | `mr-smith` |

> **Why the `ł` map matters:** `ł` is one indivisible codepoint with no combining
> mark, so NFKD leaves it intact and the strip would delete it — turning
> `główna` into the wrong (and unfortunate) `gowna`. The explicit fold prevents this.

### Conventions normalization cannot enforce (your discipline)

- **Look-alikes:** `o`/`0`, `l`/`1`, `S`/`5`. `visa1` ≠ `visaI`. Pick a habit
  (spell numbers as words, or never place a letter beside a digit).
- **Semantic drift:** `visa` ≠ `visa-card` ≠ `card-visa`. Keep a fixed naming
  rule (e.g. "issuer only, no suffixes"). The fingerprint (§7) catches violations.

---

## 6. Digit extraction (frozen)

Map HMAC bytes to decimal digits with **rejection sampling** to avoid modulo bias
(256 is not a multiple of 10; naive `byte % 10` over-weights digits 0–5).

```
function digits(master_key, base_message, count):
    out = []
    n = 0
    repeat:
        msg   = base_message  if n == 0  else  base_message + "|" + n
        bytes = HMAC-SHA256(master_key, msg)
        for b in bytes:
            if b < 250:                 # discard 250..255
                out.append(b mod 10)
                if len(out) == count: return out
        n = n + 1
```

PIN length is a per-derivation **option** (4 / 6 / 8). Shorter PINs are *not*
prefixes of longer ones here (each length is just `count` digits off the same
stream — a 4-digit PIN is the first 4 of the 6-digit one, since the stream is
identical; if you want length-independence instead, fold length into the message.
**Default: same stream, prefix-compatible.**)

Other keypad constraints (no repeats, no runs) are applied by **rejecting whole
candidate PINs** and pulling the next `count` digits from the stream — keep it
deterministic, never re-roll randomly.

---

## 7. Fingerprints (word-based, non-secret)

Two fingerprints, same mechanism, both **two words** from a single frozen
256-word list. Words are chosen over emoji/color because the high-value check
here is unambiguous recognition with zero rendering dependency: text reads the
same on every device and can be confirmed aloud.

| Fingerprint | Source message | Shown | Catches |
|-------------|----------------|-------|---------|
| **Login**   | `login|v1`        | right after Argon2id, at login | wrong username/password pair |
| **Label**   | `fp|v1|` + label  | the instant a label is entered, before the PIN | label typo / look-alike / drift |

### Mechanism

```
word_0 = WORDS[ bytes[0] ]        # one byte → one word
word_1 = WORDS[ bytes[1] ]        # 256 words, 256 | 256  → unbiased, no rejection
fingerprint = word_0 + " " + word_1
```

Two words = 16 bits ≈ **65,536** combinations. For both uses you are comparing
the real input against a handful of near-misses (the right password vs. a few
mistypes; the right label vs. `visa`/`visa1`/`vlsa`), so a collision would
require ~1-in-65k bad luck. Ample. Three words (24 bits ≈ 16M) is available as
cheap headroom if ever wanted, at the cost of one extra word to read — not
needed at this scale.

### Why login fingerprint is derived from the **key**, not the text

Computing it from a fast hash of `username+password` would create an **offline
password oracle**: anyone who glimpses the displayed words could hash candidate
passwords through the same fast function until one matches, bypassing Argon2id
entirely. Deriving from the master key means each guess costs a full Argon2id
pass — the fingerprint leaks nothing the key doesn't already gate. The price is
that the words appear only *after* the (deliberately slow) Argon2id run, which is
correct: a once-per-session check, not per-keystroke. Anything fast enough to
update live is fast enough to be the oracle.

### WORD list (frozen, 256 entries)

Vendor an exact, ordered 256-word list — recommended source: the **PGP biometric
word list** (one of its two 256-word columns), built for read-aloud phonetic
distinctness. EFF/Diceware filtered to 256 also works. The list must be committed
verbatim in the implementation; index = byte value (0–255).

> The word list is frozen. Reordering or substituting it re-derives every
> fingerprint (PINs are unaffected — different message namespace). It is
> recognition-only: show briefly, never log or sync, treat like SSH randomart.

---

## 8. Security analysis (honest)

- **Ceiling = passphrase entropy.** Argon2id only buys time against guessing; it
  cannot create entropy the passphrase lacks. Use several words. Two digits would
  be brute-forced through the public chain instantly — the whole reason this
  design moved the secret from "two digits" to a passphrase.
- **Master key at rest = device security.** The key is persisted as a
  **non-extractable** WebCrypto `CryptoKey` (§10): JS cannot read its bytes, so
  XSS/exfiltration cannot *steal* it — only *use* it live while the page is open.
  Device-in-hand access still yields PINs; closing that needs a biometric wrap
  (WebAuthn PRF), deferred. Never store the raw key bytes.
- **Label is not secret.** It selects, it doesn't protect. Don't spend secrecy here.
- **Fingerprints are not secret, but are key-derived.** Both leak nothing about
  any PIN (separate message namespaces). Critically, the login fingerprint is
  derived from the master *key*, never from raw `username+password` text — a
  text-hash fingerprint would be an offline password oracle that bypasses
  Argon2id. Show fingerprints briefly; don't log or sync them.
- **No PIN storage.** Nothing reversible to the PINs is ever written down.

---

## 9. Login phase — UI states

The login screen never authenticates; it derives a key and lets *you* recognize
its fingerprint. The trigger is the action button (hijacked), not blur, so there
are no surprise derivations. Two booleans drive everything: `dirty` (fields
changed since last derive) and `deriving` (Argon2 in flight).

**The one invariant:** a fingerprint is on screen **only while the form is
clean**. Any edit to either field ⇒ blank the fingerprint immediately. This is
what guarantees you can never recognize words that don't match the current
credentials.

### Button faces

| State | Button | Meaning |
|-------|--------|---------|
| `dirty`, not deriving | **Generate fingerprint** | unverified input — the only available action is to derive |
| `deriving` | **Deriving…** (disabled / spinner) | Argon2id running |
| clean (derived, unchanged) | **Proceed** | fingerprint shown for the current fields; pressing asserts *you* recognized it, then persists the key (§10) |

> "Proceed", not "Login" — nothing is authenticated. The button is your assertion
> that the words matched, not the app's confirmation.

### Transitions

```
edit either field        → dirty = true; BLANK fingerprint; button → Generate
                           (also invalidates any in-flight derive)
click Generate           → deriving = true; snapshot {username,password}; run Argon2id
Argon2id resolves        → if snapshot === current fields:
                               show fingerprint; dirty=false; deriving=false; button → Proceed
                           else: discard result; stay dirty; button → Generate
click Proceed            → storeKey(key) (§10); leave login phase
```

The discard branch is essential: a slow Argon2id that resolves *after* you've
edited a field must be dropped, not rendered — tag each run with its input
snapshot and only display if the fields still match.

---

## 10. Key persistence (non-extractable IndexedDB)

Goal: open the app on a return visit and generate PINs immediately, with **no**
Argon2id re-run — without ever storing extractable key material.

Because step 2 is entirely HMAC, the raw key bytes are needed only to *create* an
HMAC key, never again. So:

1. **Derive** raw bytes with Argon2id (§3).
2. **Import** them as an HMAC `CryptoKey` with `extractable: false`, hash
   `SHA-256`, **default length** (full 256 bits — part of the frozen contract;
   truncating changes every output).
3. **Zero** the raw `Uint8Array` immediately. From here only the opaque handle exists.
4. **Store** the `CryptoKey` *object* in IndexedDB (it structured-clones natively).
   There is **no `exportKey`** anywhere — if you write one, something is wrong.

The raw key exists only for the microseconds between step 1 and step 3; don't
copy it into logs, React state, or any longer-lived variable.

### Lifecycle

- **On open:** `loadKey()`. If present → go straight to the label screen (no
  Argon2, no login fingerprint; the stored key is the one you already verified at
  Proceed). If absent → run the §9 login phase.
- **Login fingerprint cadence:** it guards the *derivation* moment, not every
  open. You see it once (at Proceed); a persisted key is trusted until Forget.
- **Forget:** delete the IndexedDB record. The only meaningful "logout" — use for
  a lost device, credential change, or rotation.

> Testing note: Claude artifacts block IndexedDB *and* localStorage, so
> persistence only works in your own hosted deployment, not in an artifact preview.

---

## 11. Reference implementation (JavaScript — `@noble/hashes` + WebCrypto)

```js
import { argon2id } from '@noble/hashes/argon2';
import { WORDS }    from './wordlist-v1.js';   // frozen, length === 256

const enc = (s) => new TextEncoder().encode(s);

// ── §5 normalization (frozen v1) ───────────────────────────────
export function normalize(raw) {
  let s = raw.normalize('NFC');
  s = s.toLowerCase();                                  // locale-invariant in JS
  s = s.replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd');
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');       // drop combining marks
  s = s.trim().replace(/\s+/g, '-');                    // whitespace → dash
  s = s.replace(/[^a-z0-9-]/g, '');                     // strip
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');      // collapse/trim dashes
  return s;
}

// ── §3 + §10 derive, import NON-EXTRACTABLE, zero raw bytes ─────
export async function deriveKey(password, username) {
  const salt = enc('pinapp|v1|salt|' + normalize(username));
  const raw  = argon2id(enc(password), salt, { t: 3, m: 65536, p: 1, dkLen: 32 });
  const key  = await crypto.subtle.importKey(
    'raw', raw,
    { name: 'HMAC', hash: 'SHA-256' },   // default length = full 256 bits (FROZEN)
    false,                               // extractable: false  ← the whole point
    ['sign'],
  );
  raw.fill(0);                           // zero the only raw copy
  return key;                            // opaque handle; bytes unreadable from JS
}

// ── HMAC via WebCrypto → 32 bytes ──────────────────────────────
async function mac(key, message) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(message)));
}

// ── §6 digit stream ────────────────────────────────────────────
async function digits(key, baseMsg, count) {
  const out = [];
  for (let n = 0; out.length < count; n++) {
    const m = await mac(key, n === 0 ? baseMsg : `${baseMsg}|${n}`);
    for (const b of m) {
      if (b < 250) { out.push(b % 10); if (out.length === count) break; }
    }
  }
  return out;
}

// ── §4/§6 PIN ──────────────────────────────────────────────────
export async function derivePin(key, rawLabel, length = 4) {
  return (await digits(key, `pin|v1|${normalize(rawLabel)}`, length)).join('');
}

// ── §7 word fingerprints ───────────────────────────────────────
async function twoWords(key, message) {
  const m = await mac(key, message);
  return `${WORDS[m[0]]} ${WORDS[m[1]]}`;
}
export const loginFingerprint = (key)           => twoWords(key, 'login|v1');
export const labelFingerprint = (key, rawLabel) => twoWords(key, `fp|v1|${normalize(rawLabel)}`);

// ── §10 persistence: store/load/forget the CryptoKey itself ────
const DB = 'pinapp', STORE = 'keys', ID = 'master';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
export async function storeKey(key) {            // structured-clones CryptoKey; NO exportKey
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, ID);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
export async function loadKey() {                // CryptoKey, or null if none
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(ID);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror   = () => rej(rq.error);
  });
}
export async function forgetKey() {              // the only real "logout"
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(ID);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

// ── lifecycle ──────────────────────────────────────────────────
// On open:
//   let key = await loadKey();
//   if (key)  → label screen; await derivePin(key, 'Visa', 4)   // no Argon2
//   else      → login phase (§9):
//                 key = await deriveKey(password, username);
//                 show await loginFingerprint(key);  // recognise, or re-enter
//                 on "Proceed":  await storeKey(key);
// Forget (logout / lost device / rotation):  await forgetKey();
```

> `@noble/hashes` supplies Argon2id (WebCrypto has none). HMAC runs through
> `crypto.subtle` so it can use the **non-extractable** key handle — the raw
> bytes never outlive `deriveKey`. Both run in browser and Node.

---

## 12. Frozen-surface checklist

Changing any item below re-derives outputs and forces manual rotation:

- [ ] Argon2id: `t=3, m=65536, p=1, dkLen=32`
- [ ] Salt rule: `"pinapp|v1|salt|" + normalize(username)`
- [ ] PIN message: `"pin|v1|" + label [+ "|" + n]`
- [ ] Label-FP message: `"fp|v1|" + label`
- [ ] Login-FP message: `"login|v1"`
- [ ] Normalization v1 (the 7 steps + `ł/ø/đ` map)
- [ ] Digit rule: reject `≥250`, then `mod 10`
- [ ] HMAC output length: full SHA-256 (256 bits) — default at `importKey`
- [ ] WORD list (exactly 256, in order)
- [ ] Contract namespace string `v1`
