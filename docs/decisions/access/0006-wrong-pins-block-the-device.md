# 0006 Wrong PINs are logged first, block the device, and are shown to the owner

Status: accepted
Date: 2026-10-08

## Context

A 4–8 digit PIN typed at the counter can be guessed by trying. A time-based
backoff lets anyone keep trying slowly, and changing the device clock
shortens it.

## Decision

- There is no backoff, only a log of failed attempts in the device
  database, per device and account: blocking on one account leaves the
  device's other accounts alone.
- Under one Web Lock per account, the block is checked first, so a blocked
  device never verifies; then the attempt is written and the write awaited,
  and only then is the PIN verified. Evolu persists asynchronously, so
  writing after showing "wrong PIN" would let a reload hide the attempt.
- Five failed attempts in a row block PIN entry on that device, one-shot
  prompts included. The device writes `pinBlockedAt` to its synced row and
  keeps its default permissions.
- The owner unblocks it from another device (Settings → Access, asking for
  the PIN): that writes a new random `pinUnblockToken` to its row. The
  blocked device applies a token it has not applied yet by noting the log
  length then; only attempts after that count. A token, not a time, so the
  device clock cannot make later attempts look older.
- Or the owner enters the recovery phrase on it: compared as a master key,
  not a string; a wrong phrase is not a failed attempt.
- A correct PIN or phrase first lists the failed attempts since the last
  success — time and what each tried to unlock — and clears them once the
  owner has seen them. Nobody but the owner can clear the log, so someone
  trying codes cannot hide it. Unblocking neither shows nor clears it.
- The PIN keypad carries `data-pin-pad`, and the Sentry breadcrumb scrubber
  drops every `ui.*` breadcrumb inside it, so the selectors of the clicked
  digits never spell the PIN. Neither the PIN nor the phrase is logged.

## Alternatives considered

A time-based unblock: anyone could try PINs slowly and indefinitely.

## Consequences

- Anyone at the counter can block a device on purpose. An owner with no
  other device of the account has only the phrase, at the counter; the PIN
  screen warns before the phrase input.
- The log lives on the device it happened on; the owner sees it the next
  time they enter the PIN or phrase there.

## Enforced by

- `src/core/modules/access/access-actions.test.ts > enterPin > logs the attempt and awaits the write before verifying`
- `src/core/modules/access/access-actions.test.ts > enterPin > says how many attempts are left`
- `src/core/modules/access/access-actions.test.ts > enterPin > blocks after five wrong PINs in a row and never verifies again`
- `src/core/modules/access/access-actions.test.ts > enterPin > blocks per account: the device's other accounts keep their PIN entry`
- `src/core/modules/access/access-actions.test.ts > enterPin > a correct PIN returns the failed attempts and only the owner's clear removes them`
- `src/core/modules/access/access-actions.test.ts > unblocking > an unblock token makes earlier attempts stop counting, but keeps them in the log`
- `src/core/modules/access/access-actions.test.ts > unblocking > a token is applied once, so a stale one does not unblock again`
- `src/core/modules/access/access-actions.test.ts > unblocking > the recovery phrase works on a blocked device and a wrong one is not an attempt`
- `src/core/modules/access/access-utils.test.ts > recoveryPhraseMatches > matches the account's phrase however it is spaced or cased`
- `src/core/sentry.test.ts > sentry scrubbing > drops a click inside the PIN pad, so its selectors cannot spell the PIN`
- `e2e/access.spec.ts > five wrong PINs block the device, and the recovery phrase unblocks it`
- `e2e/access.spec.ts > another device unblocks a blocked one`
- `e2e/access.spec.ts > wrong PINs followed by the correct one show the failed attempts`
