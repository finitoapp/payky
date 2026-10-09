# 0001 One owner PIN is a staff lock, and roles belong to devices

Status: accepted
Date: 2026-10-08

## Context

Settings and dangerous actions (refunds, discarding a bill, confirming
money by hand, the payment accounts) were open to whoever held a device.
A shop wants the cashier's tablet to sell and nothing more, while the
owner can still do everything from any device.

The lock cannot be cryptography: the PIN hash syncs to every holder of the
account, a 4–8 digit PIN falls to an offline brute force, and anyone with
DevTools, root or the account on another device can write around it. It
keeps staff and customers at the counter out. It does not stop an attacker.

## Decision

- Access control is switched on and off per account (`accessControl`, one
  row at a fixed id so two devices merge into it). While it is off,
  everything is allowed.
- The account has exactly one PIN, 4–8 digits, held by the owner and any
  co-owners. Salt, PBKDF2 iteration count and hash sit in one column, so a
  merge of two devices' writes cannot pair one device's salt with the
  other's hash. The decoder bounds the iteration count and the salt: the
  value syncs, and an unbounded count written by one device would freeze
  every device that verifies a PIN. A value outside the bounds is no PIN.
- Roles belong to devices, not to people: each device has default
  permissions it holds without the PIN (access/0004). The PIN grants every
  permission. Effective permissions are the defaults, or everything during
  a PIN session or while access control is off.
- Turning access control on sets the PIN in the same batch. The PIN is
  never cleared, only replaced; turning access control off keeps it, and
  turning it on again reuses it (after asking for it) or sets a new one.
- Changing the PIN, turning access control off and unblocking a device
  always ask for the current PIN, even on a device whose defaults include
  `admin`. Otherwise a device set to Owner by mistake could replace the
  PIN and lock the owner out.
- Whoever turns access control on starts a PIN session on that device:
  they just set or entered the PIN.

## Alternatives considered

- A PIN per person carrying that person's permissions: any holder of a PIN
  could brute-force a stronger one at the counter — four tries, then their
  own correct PIN resets the failed attempt counter, repeat. With one PIN
  only the owner can reset the counter (access/0006). The cost is that no
  one between staff and owner authorizes anything with a PIN; a shift lead
  needs a device of their own set to Shift lead.

## Consequences

- Removing a co-owner means changing the PIN. It locks them out of the PIN
  screen only: what they read while they knew it (the recovery phrase, the
  Spark mnemonic, an export) stays with them.
- A device that has not seen access control turned on yet can still write
  as if it were off, and its later writes win the merge: it can replace the
  PIN, switch access control off again, or set every device's defaults.
  Accepted; the window is one device's offline period.
- Every merge takes "later" from Evolu's hybrid logical clock, so a device
  whose clock runs ahead wins while it does. Evolu rejects a remote
  timestamp more than `defaultTimestampMaxDrift` (5 minutes) ahead, which
  bounds that.
- In a desktop browser the lock is cosmetic; Settings → Access says so. It
  means something in the Android app, ideally in kiosk mode.
- PBKDF2 runs `pinHashIterations` rounds; the count is a guess at ~300 ms
  on low-end Android and stored with each hash, so it can be tuned later.

## Enforced by

- `src/core/modules/access/access-actions.test.ts > enableAccessControl > turns access control on with the PIN and the wizard's defaults in one go`
- `src/core/modules/access/access-actions.test.ts > enableAccessControl > turning it off keeps the PIN, and on again can reuse it`
- `src/core/modules/access/access-actions.test.ts > enableAccessControl > cannot reuse a PIN that was never set`
- `src/core/modules/access/access-actions.test.ts > enterPin > a changed PIN replaces the old one`
- `src/core/modules/access/access-utils.test.ts > PinSchema > accepts %s`
- `src/core/modules/access/access-utils.test.ts > PinSchema > rejects %s`
- `src/core/modules/access/access-utils.test.ts > PIN hash > treats %s as no PIN`
- `src/core/modules/access/access-utils.test.ts > effectivePermissions > are the defaults without the PIN`
- `src/core/modules/access/access-utils.test.ts > effectivePermissions > are every permission with a PIN session`
- `src/core/modules/access/access-utils.test.ts > effectivePermissions > are every permission while access control is off`
- `e2e/access.spec.ts > turning access control on with the wizard locks what the device was not given`
- `e2e/access-gates.spec.ts > an Owner device still needs the PIN to change it, to turn access control off and to unblock`
