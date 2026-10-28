# 0012 Payky keeps its own Cashu wallet in the app database

Status: accepted
Date: 2026-10-28

## Context

`cashu/0001` wrote Payky's Cashu payments into Linky's wallet, in Linky's
format: four Linky tables in the app database under Linky-derived shard
owners, with pointer rotation, copy-on-write and merge rules, rows that had
to match Linky's byte for byte, a seed shared with Linky, and books that
followed the shared wallet through Evolu's internal `evolu_history`. Cashu
was in no release yet (`v26.10.3` holds no Cashu file), so no merchant's data
depends on that format. The owner decided on 2026-10-26 that Payky owns its
wallet (`docs/plans/cashu-own-wallet.md`, R1–R4), and on 2026-10-28 that it
lives in the app database, like every other domain table.

## Decision

- The tables are Payky's and live in the app database under the app owner:
  `cashuProof`, the `cashuOperation` root with one detail per kind
  (`cashuTopup`, `cashuReceive`, `cashuMelt`), `cashuMove`, `cashuMint`, and
  the local-only `_cashuCounter`, `_cashuClaimAttempt` and
  `_cashuTokenArrival`, which the leading underscore keeps off the relays.
  There is no `accountId` column: each account has its own app database.
  Operation ids derive from what the operation is about, so two devices
  write one row. There is no sharding.
- They sync with the rest of the account's backup, over its relays and under
  its identifier, whether Cashu is enabled or not, as a disabled Spark or FIO
  account's rows do. An account that never enabled Cashu has no Cashu rows.
- The Cashu account's id is the constant `account:cashu`: an account database
  holds one Cashu wallet.
- The wallet seed is BIP-85 HEX at `m/83696968'/128169'/64'/0'`, 64 bytes
  used as the BIP-39 seed directly. Linky derives nothing under `128169'`, so
  the two wallets cannot collide.
- A state transition is one batch: the proofs and the operation's status
  together, with the app rows the transition implies (cashu/0014).
- The nostr key stays the primary Payky npub, as Linky's (cashu/0015).
- The Cashu job runs under an error boundary of its own, so a mint or the
  SDK crashing it stops no other job; Cashu actions load the cashu-ts wallet
  lazily (`useCashuAppRun`).

## Alternatives considered

- A database of its own: a second Evolu per account under an owner derived
  from the master key, synced only while Cashu is enabled. A rule between the
  wallet and the books could then not be one batch (booking, payment
  preparation, enabling Cashu with its default mint), the wallet started
  syncing only after the app database delivered a live Cashu account, so a
  restored device saw no mints and wrote a default over the merchant's, and
  it took a second owner, atom, run, query hook and test helper.
- A further owner inside the app database: a second owner and its sync gate
  for no rule that needs them.
- Keeping Linky's format: every cost listed above, for a wallet Payky alone
  writes.

## Consequences

- Linky and Payky no longer show one balance. Ecash received in Linky stays
  in Linky; Payky's stays in Payky.
- The old Linky tables are dropped from the schema with no migration; an
  account that had enabled Cashu enables it again.
- A Cashu bug can write into the app database, the exposure Spark and FIO
  already have; every Cashu write stays inside `modules/cashu`.
- Proofs and operations grow the app owner, which a per-owner relay quota
  would meet.

## Enforced by

- `packages/core/src/modules/cashu/cashu-app-database.test.ts > the Cashu wallet in the app database (cashu/0012) > two devices of one account sync the wallet through a relay, but not its local counters`
- `packages/core/src/modules/cashu/cashu-app-database.test.ts > the Cashu wallet in the app database (cashu/0012) > an account that never enabled Cashu has no Cashu rows to sync`
- `packages/core/src/modules/shared/key-derivation.test.ts > key derivation > uses the documented Payky derivation paths`
- `packages/core/src/modules/shared/key-derivation.test.ts > key derivation > derives the 64-byte Cashu wallet seed from BIP-85 HEX, with no mnemonic`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > Cashu ids and spellings > operation ids derive from what the operation is about, so devices agree`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a paid quote is minted into available proofs and closed done in one batch`
- `packages/core/src/background-jobs/background-jobs.test.ts > getBackgroundJobsForRuntime > keeps the Cashu job apart, so a Cashu wallet that fails to start stops no other job`
