# 0013 The trusted mints are one list in one cell, the default first; the seed waits for this device's sync

Status: accepted
Date: 2026-10-29

## Context

`cashu/0002` took the default mint from Linky's wallet setting. With a
wallet of Payky's own (cashu/0012) the default is Payky's, and the merchant
trusts several mints next to it (cashu/0016).

Evolu merges a row cell by cell, the later write winning each cell. A rule
that spans cells does not survive the merge. Kept as a row per mint, the
rule that one mint stays trusted (`cashu/0015`) broke whenever two devices
untrusted different mints offline: each kept one, and merged, none was
trusted. A repair after the fact cannot tell that state from a first sync
still under way, so it would undo untrusts the merchant made on purpose.
A default kept apart from trust could likewise end up at a mint nobody
trusts.

A new account needs a mint to take Cashu payments at all, and enabling
Cashu trusts `MAIN_MINT_URL` for it. A device cannot tell "the account has
no list" from "the list has not arrived" by its rows. Written before the
list arrived, that seed would quote payments at `MAIN_MINT_URL` and receive
its tokens, even where the merchant had untrusted it. The window is real:
the terminal opens on a restored device as soon as its settings sync in,
while the rest of the first sync still runs. Evolu's sync state does tell
the two apart. Once every relay of the app owner has completed a sync,
this device holds everything the relays held.


A relay that cannot be reached, down or misconfigured, never completes a
sync, so on an account with one the condition stays false for the whole
session. Counting such a relay as done would be a guess: a list the
merchant wrote while the other relays were down may sit on it alone.

## Decision

- The trusted mints are one list in one cell,
  `cashuMintTrust.trustedMintsJson`, on the account's one row at a fixed
  id. The first mint is the default. `accountCashu` holds no mint.
- Trusting a mint adds it at the end, so the default does not change.
  "Use for payments" moves a trusted mint to the front. Untrusting removes
  it and hands the default to the next, the previous choice. The last mint
  cannot be untrusted.
- Every write is the whole list as this device sees it, never empty. A merge
  of two devices' changes is one of the two lists as its device wrote it,
  so no merge leaves no mint trusted, and nothing repairs trust afterwards.
- Enabling Cashu on a device that knows no trusted mint writes
  `MAIN_MINT_URL` to `seedMintUrl`, a cell of its own. It counts only while
  no device has written the list: a list written anywhere outranks it,
  whichever write came later.
- The seed is written only once every relay of the app owner has completed
  a sync since the app started (`AppOwnerSyncDep`). A later round that a
  write starts does not undo that, since the first completed round already
  brought what the relay held. An account that does not sync, a demo or
  one with no transports, counts as synced. Enabled before that, the
  account gets no seed, and the Cashu job writes it on its first pass once
  the device has synced, unless the merchant's list arrived first. Whether
  it is due is read again on every pass, so a restart loses nothing.
  Whether it is due is read from the cells: a list this device cannot
  decode was written all the same, and no seed is written over it.
- `AppOwnerSyncDep` answers `complete`, `pending` while a relay that has
  not completed is still connecting or syncing, or `blocked` once each such
  relay has failed or cannot be reached, naming them. Only `complete`
  counts as synced, here and for orphan recovery (`cashu/0031`).
- On a blocked sync, the screens that say the mints have not synced name
  the relays this device cannot reach, point to the sync settings, and
  offer to take payments at the default mint until the list arrives.
  Confirmed by someone holding the `admin` permission, it writes the seed
  (`seedCashuMintOnConfirm`), which any list arriving later still
  outranks. It is refused while a relay is still on its way.
- A device that knows neither cell has not synced the account's mints. It
  trusts none, quotes no payment and writes no list (`cashu/0018`).
- Preparing a payment writes no mint. A payment is quoted at the default
  and keeps the mint its quote is at. "Move funds" targets the default.

## Alternatives considered

- A row per mint, with the default as the newest `defaultedAt` and a repair
  that trusts the last default again when concurrent untrusts left none:
  the repair cannot tell that state from a sync still under way.
- Writing on each untrust the mints it left trusted, so that any device
  can recognise the conflict: the conflict would still arise and still need
  a write to repair it.
- A default on the account apart from trust: two cells that can disagree.
- Reading a missing list as a default list at read time, writing no seed:
  every device that has not synced would quote at `MAIN_MINT_URL`, which
  `cashu/0018` prevents, and the meaning of a stored null would change with
  the app version that reads it.
- Seeding only when a new account is created: an account that enables
  Cashu later would need the same sync signal to tell whether it may seed.
- Counting a relay that failed as complete once another relay completed:
  it guesses at what the unreachable relay holds, and a wrong guess takes
  payments at a mint the merchant untrusted.
- Writing the list, not the seed, on the merchant's confirmation: a later
  write wins the cell, so a list the merchant wrote before would be lost
  when the relay came back.

## Consequences

Of changes made on two devices before they sync, the later list stands
whole and the other device's change is lost: a mint trusted there is not
trusted, or one untrusted there is trusted again. Both show on the mints
screen, and the merchant makes the change again. Mints change rarely, and
a lost change is better than a state no device chose.

On a new account whose device cannot reach a relay, Cashu takes payments
only once a relay answers, though the mint may be reachable. Once written,
the seed is stored and works offline. A list written on a device that
never reached a relay is missing here and the seed is written. When the
list arrives, it wins.

A device whose relay stays unreachable takes Cashu payments only after the
merchant says so, and then at `MAIN_MINT_URL` even where they had untrusted
it on another device, until the list arrives; the confirmation says so.

## Enforced by

- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > no merge leaves no mint trusted (cashu/0013) > untrusts made on two devices at once leave one device's list, never none`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > lists changed offline on two devices merge into the later one, whole (cashu/0013)`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > a device that has the Cashu account but not yet its mints overrides neither the default nor trust`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > enabling Cashu on a device without the mints does not demote MAIN_MINT_URL chosen again`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the default mint > enabling Cashu seeds MAIN_MINT_URL once, and enabling again keeps the merchant's choice`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the default mint > only a trusted mint becomes the default`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > trusts a mint that loads, without changing the default`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > untrusting the default hands it to the previous choice, which it returns`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > enabling Cashu again keeps an untrusted MAIN_MINT_URL untrusted`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the seed waits for this device's sync (cashu/0013) > enabling Cashu before this device synced seeds nothing, and no payment is quoted`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the seed waits for this device's sync (cashu/0013) > once synced, the seed is written then, a restart in between losing nothing`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the seed waits for this device's sync (cashu/0013) > the merchant's list arriving before the sync completes leaves nothing to seed`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the seed waits for this device's sync (cashu/0013) > enabling Cashu on a device that has synced seeds at once`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > seeds an account enabled before this device synced, once it has (cashu/0013)`
- `packages/core/src/evolu/initial-sync-state.test.ts > ownerSyncStateOf (cashu/0013) > is complete once every relay has completed a sync since the app started`
- `packages/core/src/evolu/initial-sync-state.test.ts > ownerSyncStateOf (cashu/0013) > stays complete while a relay syncs again, as after any write`
- `packages/core/src/evolu/initial-sync-state.test.ts > ownerSyncStateOf (cashu/0013) > is pending while a relay that never completed is still connecting or syncing`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the trusted mints (cashu/0013) > are the list as written, the default first`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the trusted mints (cashu/0013) > a list written anywhere outranks the seed, whichever came later`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the trusted mints (cashu/0013) > untrusting the default hands it to the next in the list`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes at the default mint`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes at the default and writes nothing to the trusted mints (cashu/0013)`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > a device that knows no trusted mint (cashu/0018) > quotes at the merchant's list once it syncs in, not at the seed this device wrote before it (cashu/0013)`
- `packages/core/src/evolu/initial-sync-state.test.ts > ownerSyncStateOf (cashu/0013) > is blocked, naming them, once every relay that never completed has failed or is unreachable`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a blocked sync is seeded only on the merchant's word (cashu/0013) > a relay that cannot be reached seeds nothing on its own, and no payment is quoted`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a blocked sync is seeded only on the merchant's word (cashu/0013) > the merchant's confirmation seeds the default mint, and a list that arrives later still wins`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a blocked sync is seeded only on the merchant's word (cashu/0013) > the confirmation is refused while a relay is still on its way`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the seed waits for this device's sync (cashu/0013) > a list this device cannot decode is never seeded over, pass after pass`
