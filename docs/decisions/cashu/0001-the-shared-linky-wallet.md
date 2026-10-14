# 0001 Cashu payments go into Linky's own wallet, written in Linky's format

Status: accepted
Date: 2026-10-14

## Context

The owner wants a merchant's Cashu ecash to be the same wallet Linky, the
owner's personal wallet app, shows: a master key moved from Linky into Payky
sees the same proofs and the same balance, and the reverse (`cashu.md`,
decisions 1, 1b, 2, 8, 9). Linky keeps the wallet in Evolu shard owners
derived from its own app owner, which is derived from the same master key
Payky holds. Linky decodes every row against its own schemas and silently
skips one that fails. Both apps are the owner's own.

## Decision

- Payky derives Linky's app owner (`m/83696968'/39'/0'/24'/1'/0'`) and the
  Cashu wallet seed (`m/83696968'/39'/0'/24'/0'`) exactly as Linky does. The
  seed is always derived; there is no custom Cashu seed.
- While the Cashu account is enabled, Payky's app Evolu syncs Linky's app
  owner and every cashu shard `0..active` next to its own owner, over
  Linky's relays; an account that never enabled Cashu contacts none of them
  (landing/0009). The app database holds Linky's
  four tables (`shardPointer`, `setting`, `cashuProof`, `cashuOperation`)
  column for column. There is no Payky-owned copy of the proofs.
- Only the Cashu shard store (`src/core/cashu/cashu-shard-store.ts`) writes
  them, always under a Linky owner, never Payky's own, and only the Cashu
  module queries them, each query naming its owners. It follows Linky's
  shard rules: the pointer, rotation after 256 KiB or 170 mutations at most
  once a minute, copy-on-write into the active shard, the merge in which any
  spent copy of a proof wins, writes held until hydrated, a pointer repaired
  only upwards. An account Linky never saw writes shard 0 with no pointer,
  as Linky does, and its first rotation creates the pointer.
- Ids, operation keys, mint URLs and the rows Payky writes match Linky byte
  for byte; cross-app vectors in both repositories pin them.
- Payky trusts the synced data as its own: it defends only against what a
  row does not mean, not against a row because Linky wrote it.

## Alternatives considered

- A Payky-owned copy of the proofs, synced with Linky's by some bridge: two
  wallets to reconcile, and the balance would differ between the apps.
- Depending on Linky's `linkshu`/`linksync` packages: they are built on
  Effect and Evolu 7, while Payky runs Evolu 8 and Tasks.

## Consequences

- A change to Linky's format can silently break Payky, and a row Payky writes
  wrong is silently skipped by Linky. The cross-app tests in both repositories
  are the guard; Linky's `AGENTS.md` names Payky as a second writer.
- Payky depends on Evolu's internal `evolu_history` for the rotation;
  `evolu-history-shape.test.ts` fails when it changes.
- Enabling Cashu makes a Payky device download the owner's whole Linky
  wallet.

## Enforced by

- `src/core/modules/shared/key-derivation-cross-app.test.ts > Payky key-derivation API matches the cross-app vectors > derives Linky's meta owner from its pinned vector`
- `src/core/modules/shared/key-derivation-cross-app.test.ts > Payky key-derivation API matches the cross-app vectors > derives the shared Cashu wallet seed from its pinned vector`
- `src/core/modules/cashu/cashu-cross-app.test.ts > cross-app Cashu vectors (shared with Linky) > mint url %j normalises to %j`
- `src/core/modules/cashu/cashu-cross-app.test.ts > cross-app Cashu vectors (shared with Linky) > operation key $key`
- `src/core/modules/cashu/cashu-cross-app.test.ts > rows Payky writes (decoded by Linky's twin) > the shard store writes exactly the pinned rows`
- `src/core/modules/cashu/cashu-table-isolation.test.ts > Linky's tables are isolated > their names appear only in the shard store, the Cashu module and the schema`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > every write names a Linky owner, never Payky's own`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > a missing pointer means shard 0, as on an account Linky never saw`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > an update of a row in an older shard copies it forward and tombstones the old copy`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > any spent copy wins the merge, even a tombstoned one`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > writes wait until the Linky owners are hydrated`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > the active shard rotates past 170 mutations, at most once a minute`
- `src/core/cashu/cashu-shard-store.test.ts > cashu shard store > repairPointers moves the pointer up to the newest shard holding rows, never down`
- `src/core/cashu/cashu-shard-store.test.ts > startCashuShardStore > a demo account registers no Linky owner and keeps its rows local`
- `src/core/cashu/cashu-shard-store.test.ts > startCashuShardStore > an account syncs Linky's owners only once Cashu is enabled, and releases them with the app Evolu`
- `src/core/evolu/evolu-history-shape.test.ts > evolu_history shape > has the columns, the rowid and the binary owner and id the Cashu code reads`
