# Plan: Payky's own Cashu wallet

> **Superseded in part (2026-10-28):** R1, the separate Cashu database, is
> replaced by `cashu/0012`: the
> wallet's tables now live in the app database. The rest of this plan stands
> as history.

## Context

Payky's Cashu payment method (`packages/core/src/cashu/`, `packages/core/src/modules/cashu/`, about 8.4k lines) currently writes into **Linky's** wallet, using Linky's format (`cashu/0001`). That has several costs:

- Four Linky tables (`shardPointer`, `setting`, `cashuProof`, `cashuOperation`) sit in the app Evolu, under Linky-derived owners. They are spread over shard owners with pointer rotation, copy-on-write and merge rules.
- The rows must match Linky's byte for byte, held by cross-app vectors in both repos.
- The seed is shared with Linky. Collision recovery and restore-on-first-use exist mainly because of that.
- The books follow every incoming operation in the shared wallet, through a cursor over Evolu's internal `evolu_history`.
- The code is shaped after Linky's `linkshu`/`linksync` instead of Payky's conventions:
  - a 922-line stateful `CashuShardStore` service with throws;
  - plain functions in place of Tasks;
  - one batch per proof;
  - `JSON.stringify` into stored columns;
  - module-level state;
  - `Linky*` names everywhere.

Goal: Payky owns its Cashu wallet. It gets its own Evolu database and its own derivation paths, and the domain code follows `AGENTS.md`.

Out of scope:

- **No migration of old data.** Cashu is on `main` but in no release tag (checked: `v26.10.3` contains no Cashu file), so the old rows are simply dropped from the schema.
- **Protocol interoperability stays.** Linky as a *customer's* wallet keeps working: BIP-321 + NUT-18 QR codes, bare `cashuB…` tokens matched by amount.

### Owner's decisions (2026-10-26)

| # | Question | Decision |
| --- | --- | --- |
| R1 | Where the wallet lives | Its own Evolu instance (a separate database). It is not an extra owner in the app Evolu. |
| R2 | Payment mint | `accountCashu.mintUrl` in the app database. Linky's `setting/defaultMint` row goes away. |
| R3 | Old data | Dropped from the schema with no app migration. A dev or edge account just enables Cashu again. |
| R4 | Nostr key for NUT-18 / NUT-20 / NUT-11 | Stays the primary Payky npub (`m/44'/1237'/0'/0/0`), as now and as Linky uses it. Consequence: see "Linky on the same npub" below. |

## Target architecture

### 1. Derivations: `packages/core/src/modules/shared/key-derivation.ts`

There are two new derivations. Both use BIP-85 HEX (application `128169'`), which Linky does not use, so they cannot collide with Linky's `24'/0'…6'` tree.

| What | Path | Use |
| --- | --- | --- |
| Cashu Evolu owner | `m/83696968'/128169'/32'/0'` | 32 bytes → `OwnerSecret` → `createAppOwner` (`deriveCashuOwnerSecret`) |
| Cashu wallet seed | `m/83696968'/128169'/64'/0'` | 64 bytes → cashu-ts `bip39seed`, with no mnemonic round trip (`deriveCashuWalletSeed`, re-pointed) |

- `deriveEntropy` returns 32 bytes today. A length parameter (32 or 64, per BIP-85 HEX) is added.
- Removed: `linkyAppOwnerDerivationPath`, `deriveLinkyAppOwnerSecret`, the Cashu vectors in `key-derivation-cross-app.test.ts` (`sharedCashuWallet`, `linkyMetaOwner`) and the old seed path `24'/0'`.
  - The nostr key vector stays, because the key is still shared.
  - New vectors in `key-derivation.test.ts` pin both paths.
- The `README.md` key table is updated.

### 2. The Cashu database: `packages/core/src/evolu/cashu-client.ts` and `cashu-schema.ts`

- `createCashuEvolu({ masterKey })`:
  - `createEvolu(CashuSchema, { appName: "PaykyCashu", appOwner: createAppOwner(deriveCashuOwnerSecret(masterKey)), transports: [], indexes: createCashuIndexes })`;
  - `createCashuQuery = createQueryBuilder(CashuSchema)`.
- The precedent is the device database (`evolu/device-client.ts`, `createDeviceQuery`).
- `CashuEvoluDep { cashuEvolu }` goes into `modules/shared/evolu-deps.ts`, next to `DeviceEvoluDep`.
- Test helper: `createTestCashuEvolu` in `packages/core/src/testing/`, on `setupRunWithEvoluDeps`, as `createTestDeviceEvolu` is built.
- **Lifecycle:**
  - `cashuEvoluAtom` is new, in `apps/web-app/src/atoms/cashu.ts` and `apps/native-app/src/atoms/cashu.ts`. The Cashu atoms move there out of `atoms/evolu.ts`.
  - It is created per account, and only while `cashuAccountQuery` has a live row, so `landing/0009` still holds: an account without Cashu opens no connection.
  - It is disposed through `renewAtomLifetime`, like the app Evolu.
  - `useOwner(cashuEvolu.appOwner, transports)` takes the account's own transports, with `${ownerId}` resolved to the Cashu owner id (`resolveTransportUrl`).
  - A demo account gets no transports.
- `useCashuAppRun` / `useCashuRunToast` and the separate `CashuBackgroundJobs` boundary in `App.tsx` stay. The reason changes: a Cashu database that fails to open must not block the rest of the app.
  - The deps become `cashuEvolu` + `cashuWallet`, with no `cashuShardStore`.
- **No sharding.**
  - Linky sharded because of a 1 MB-per-owner quota on its relay.
  - Payky's own app owner grows at the same rate (a payment ≈ a few proofs + one operation), so the Cashu owner gets the same treatment as the app owner.
  - Risk: if Payky relays ever get a per-owner quota, it is solved for both owners at once.

### 3. Data model: `packages/core/src/modules/cashu/cashu.ts` (in `CashuSchema`)

Payky's own tables, following the root + detail pattern (`payment` + `paymentCashu`). They store only what Payky writes.

| Table | Columns (essentials) | Sync |
| --- | --- | --- |
| `cashuProof` | id = `createIdFromString(secret)`, `mintUrl`, `keysetId`, `amount`, `secret`, `c`, `dleq` (via `jsonCodec`), `state: available \| held \| spent`, `operationId` | synced |
| `cashuOperation` (root) | `kind: topup \| receive \| melt`, `status`, `mintUrl`, `amount`, `keysetId`, `counter`, `error` (via `jsonCodec`), `bookedAt` | synced |
| `cashuTopup` (detail) | `quoteId`, `lnInvoice`, `expiresAt`, `locked`, `purpose: payment \| move` | synced |
| `cashuReceive` (detail) | `tokenText`, `fee` (stored at receive time, so booking needs no mint call) | synced |
| `cashuMelt` (detail) | `quoteId`, `lnInvoice`, `feeReserve`, `inputsTotal`, `purpose: withdrawal \| move` | synced |
| `cashuMove` | `sourceMintUrl`, `targetMintUrl`, `meltOperationId`, `topupOperationId` (Linky's `autoswap`, in Payky's shape) | synced |
| `cashuMint` | id from the URL, `mintUrl`: mints the user added, synced across devices. The device-local "seen" set goes away; known = `cashuMint` ∪ mints named by proofs and operations | synced |
| `_cashuCounter` | NUT-13 counter per `(mint, unit, keysetId)` | local-only |
| `_cashuClaimAttempt` | "this device reserved this counter" | local-only |
| `_cashuTokenArrival` | the state of a token message for the wait screen (it replaces the module-level `cashuTokenArrivals` Map) | local-only |

Notes:

- **Kinds and statuses** shrink to the ones Payky writes. `send`, `envelope`, `deferredReceive`, `issued`, `externalized`, `returned` and `handedOut` disappear.
- **Status enums per kind:**
  - topup and receive: `pending \| done \| failed`;
  - melt: `pending \| paid \| unpaid \| failed`.
- **Operation ids** stay derived, for idempotency:
  - topup: `topup|mint|quoteId`;
  - receive: `receive|tokenText`;
  - melt: `melt|mint|quoteId`.

  The format is Payky's own now and no longer needs to match Linky.
- **Device-local data:** the Cashu tables leave the device database (`cashuCounter`, `cashuClaimAttempt`, `cashuKnownMint`; `evolu/device-cashu.ts` goes away). The Cashu database is per account, so no `accountId` column is needed.
- **App database:**
  - `accountCashu` gets `mintUrl` (R2). It is seeded with `MAIN_MINT_URL` when the account is created; nothing is seeded asynchronously.
  - `createCashuAccountId(cashuOwnerId)` → `account:cashu:<cashuOwnerId>`.
  - `paymentCashu` and `accountTransactionCashu` stay. Only their doc comments change: they now refer to an operation in the Cashu database.
- **Removed from `AppSchema`:** `shardPointer`, `setting`, `cashuProof`, `cashuOperation`, `_cashuBookingCursor` and their indexes.

### 4. Code layout per `AGENTS.md`

**`packages/core/src/cashu/`** keeps only the SDK wrapper and protocol helpers, like `spark/`:

- `cashu-wallet.ts`:
  - `CashuWalletDep`;
  - `loadCashuWallet`, with the lazy cashu-ts import and a cache per mint;
  - `classifyMintError`, `callMint`;
  - the foreign-keyset guard, which reads proofs from the Cashu database.
- `cashu-payment-request.ts`: NUT-18, BIP-321 and the payload decoder. These are pure, and their tests turn into ordinary unit tests.
- `fake-cashu-mint.ts`, unchanged.

**`packages/core/src/modules/cashu/`** holds the domain, split by the conventions:

- Structure files:
  - `cashu-types.ts`: branded ids and enums. `LinkyString*`, `ShardPointerId`, `LinkySettingId`, `cashuShardScope` and the duplicate `NonNegativeIntSchema` / `PositiveIntSchema` go away; the shared schemas replace them.
  - `cashu-errors.ts`: the errors and Task error unions shared across files, as in `payment-errors.ts`. The naming is only `createXError` + `ReturnType`; the PascalCase aliases go (`MintUnreachable = …`).
  - `cashu-queries.ts`: ordinary queries on `createCashuQuery` with soft-delete filtering. These are read models: available proofs per mint, operation by quote, pending operations by kind, unbooked operations. They replace "load all copies, merge in JS".
  - `cashu-utils.ts`: `normalizeMintUrl`, id derivation, `sumAvailableByMint`, the fee and amount helpers.
  - `cashu-guards.ts`: loading an operation's state and the "claimed elsewhere" checks. These read and return `Result`, and never write.
- Action files (`cashu-*-actions.ts`):
  - `cashu-proof-actions.ts`: plain `upsertCashuProofRows(…, options)` / `upsertCashuOperationRows(…, options)` that take `MutationOptions`, the same pattern as `payment-number-actions.ts`. This is what lets one state transition be one batch.
  - `cashu-counter-actions.ts`: the counter as a Task under `lockManager`, plus collision recovery and NUT-09 restore. It absorbs `cashu-counters.ts` and `cashu-restore.ts`.
  - `cashu-topup-actions.ts`, `cashu-receive-actions.ts`, `cashu-melt-actions.ts`, `cashu-move-actions.ts`, `cashu-mint-actions.ts`.
  - `cashu-booking-actions.ts`.

**Background job:**

- `background-jobs/jobs/cashu-account-sync-job.ts` keeps topups, melts and moves.
- The token listener moves to `background-jobs/jobs/cashu-token-listener.ts`. It is a Task over a run, not a closure with module state.
- `integrations/nostr/nostr-cashu-inbox.ts` stays.

**Conventions applied across all files:**

- every action is a `Task<T, E, D>` over `run.deps`, with no `deps` object passed as an argument;
- expected failures return `Result`, with no throws;
- no mutable `let` loops where a pure function fits;
- stored JSON goes through `jsonCodec`;
- one `runMutationWithCompletion` per state transition (proofs + operation status together);
- logging goes through `run.deps.console`;
- the shared deps type is renamed `CashuTopupDeps` → `CashuDeps`.

### 5. Booking into the books, without `evolu_history`

- Payky is now the only writer of its operations, so booking happens at the moment an operation is completed:
  1. **Cashu batch:** the proofs `available` and the operation `done`. The money is safe from this point.
  2. **App batch** (`bookCashuOperation`): `accountTransaction` + `accountTransactionCashu` + the automatic `reconciliationClaim`.
     - The id `accountTransaction:cashu:<operationId>` makes it idempotent across devices.
     - The amount is `amount − fee`, with no call to the mint.
  3. `cashuOperation.bookedAt` is set in the Cashu database.
- **Catch-up:** the job reads `done` operations with `bookedAt is null` from an index (`status, bookedAt`). That covers a crash between batches and an operation closed on another device.
- **Not booked:** topups with `purpose = move`, and melts. A withdrawal is booked as it is today.
- **Removed:**
  - `_cashuBookingCursor`, the bootstrap window "last month", the hydration wait;
  - `evoluHistoryMaxRowidQuery`, `changedCashuOperationIdsQuery`;
  - the "deferred because the fee is unknown" path;
  - the Cashu part of `evolu-history-shape.test.ts`. The whole test goes if nothing else depends on it.

### 6. Counters and other Payky devices

- The seed is no longer shared with Linky. Collisions can now happen only between Payky devices of the same account.
- The mechanism stays, simplified:
  - a device-local counter;
  - the counter written to the operation before the mint call;
  - the claim attempt;
  - collision recovery (11003/11005/11008);
  - NUT-09 restore on a device's first use of a keyset.
- Restore-on-first-use is now cheap. The tree is only as long as Payky's own history, not Linky's.
- "Someone else got there first" (`cashu/0004`) shrinks to other Payky devices.
  - The rules stay: never write `failed` over a winner's `done`, and reclaim from the synced counter after a grace period.

### 7. Linky on the same npub (consequence of R4)

- Customers send NUT-18 tokens over NIP-17 to the primary npub, which Linky also holds. A running Linky auto-accepts tokens from chats, now **into its own, separate wallet**.
- So when Linky is quicker:
  - Payky's swap ends `11001` (already spent) with no operation of its own;
  - the arrival state is `receivedElsewhere`;
  - the payment stays **unpaid**;
  - the wait screen says another wallet received the token;
  - the merchant settles it (the money is in their Linky).
- Unlike today, Payky no longer sees Linky's operation and cannot book it. This gets a new decision record: an accepted risk and a documented recommendation not to run Linky on the same key while working the till.
- The listener's filter stays: 1:1 rooms, and only the two content forms. The support chat shares the inbox.

### 8. Mints (`cashu/0010`, `cashu/0011`)

- The **payment mint** is `accountCashu.mintUrl`.
  - "Set as default" updates the account through `updateAccount`.
  - The npub.cash warning goes (`settings.cashuMints.defaultWarning`).
- The **trust rule stays** (`cashu/0011`): Payky receives tokens only from the payment mint, and a token already in the wallet pays its payment whatever its mint.
- The **mint list** is `cashuMint` ∪ mints named by proofs and operations, plus the `PRODUCTION_MINTS` suggestions.
- **Add:** validate NUT-06 and keysets, and refuse a foreign keyset. Adding does not change the payment mint.
- **Remove:** allowed while no non-`spent` proof names the mint. The `deferredReceive` check goes; Payky never writes one.
- **Move funds:** `cashuMove` + melt + topup. It asks for the PIN.

## Proposed changes in principle (summary)

1. **Own database instead of extra owners.** No shards, no pointer, no merge, no hydration gate, no Linky relays (`VITE_LINKY_*`, `EXPO_PUBLIC_LINKY_*`, `integrations/linky/linky-relays-client.ts`).
2. **Booking at completion, plus a `bookedAt` catch-up,** instead of a cursor over Evolu's internal table. The receive fee is stored, so booking needs no mint call.
3. **Proofs and status in one batch.** No more per-proof writes, no partial states.
4. **Operations as root + per-kind detail,** instead of one wide table with 15 nullable columns.
5. **Device-local Cashu state in local-only tables of the Cashu database,** instead of the device database keyed by `accountId`.
6. **Mints the user added sync across devices** (`cashuMint`). The seen set is not needed.
7. **Token-arrival state in a local-only table,** instead of a module-level Map, so it is readable through `useEvoluQuery` and survives a remount.
8. **Payment mint on the account.** No asynchronous seed with `.catch(() => {})`.
9. **BIP-85 HEX derivations,** with no mnemonic round trip for the seed.
10. **Separate wallets, shared npub:** the Linky race on the same npub is an accepted, documented risk (§7).

## Decision records (`docs/decisions/`)

**New:**

| Record | Content | Supersedes |
| --- | --- | --- |
| `cashu/0012` | Payky's own wallet in its own Evolu database, own derivation paths, no sharding | `0001` |
| `cashu/0013` | The payment mint is `accountCashu.mintUrl`, seeded at creation | `0002` |
| `cashu/0014` | Payky books every `done` topup and receive of its own wallet at completion, with a `bookedAt` catch-up; moves and melts are not income | `0005` |
| `cashu/0015` | Someone else first = another Payky device; a token Linky took on the shared npub leaves the payment unpaid | `0004` |
| `cashu/0016` | Mint management: list, add, remove, move funds without `deferredReceive` and without npub.cash | `0010` |
| `withdraw/00NN` | A Cashu withdrawal spends Payky's own wallet | `withdraw/0012` |
| `landing/00NN` | The new outbound-connections rule for Cashu: Payky's relays, no Linky relays | narrows `landing/0009` |

**Staying, with only their `## Enforced by` test names updated:** `0003`, `0006`, `0008` (the reason "Linky retries" goes, the rule stays), `0009`, `0011`.

`bun run check:decisions` makes sure every named test exists.

## Phases

All work happens on one branch, `refactor/cashu-own-wallet`. Every phase ends with a green `bun run check` and is a separate Conventional Commit. Phases 1–2 only add code; the cutover in phase 3 is one step, because the `CashuShardStore` surface is replaced as a whole.

### Phase 0: Plan and decisions

- This document → `docs/plans/cashu-own-wallet.md`.
- Drafts of `cashu/0012`–`0016`, so the business rules are fixed before the code.

### Phase 1: Identity and database (additive)

- `deriveEntropy` with a length parameter.
- `deriveCashuOwnerSecret`, plus `deriveCashuWalletSeed` on the new path, with vectors.
- `CashuSchema`, `createCashuEvolu`, `createCashuQuery`, `CashuEvoluDep`, `createTestCashuEvolu`.
- `cashuEvoluAtom` on web and native: opened while Cashu is enabled, no transports for a demo account. Nothing reads it yet.
- **Done when** the Cashu database opens in a test and syncs between two in-memory instances.

### Phase 2: Domain module (additive, new files)

- `cashu.ts` (the new tables), `cashu-types.ts`, `cashu-errors.ts`, `cashu-queries.ts`, `cashu-utils.ts`, `cashu-guards.ts`.
- `cashu-proof-actions.ts`, `cashu-counter-actions.ts` (+ restore, collision recovery).
- `cashu-wallet.ts` over `CashuEvoluDep`.
- Topup, receive, melt, move, mint and booking actions, with tests against `fake-cashu-mint.ts`.
  - Port the existing test scenarios. Drop the Linky ones ("Linky settled", "Linky received first", "last month only") or rewrite them as "another Payky device".
- While the old code is still live, the new files get temporary names to avoid clashes (for example `cashu-wallet-actions-next`). The rename to their final names happens in phase 3.

### Phase 3: Cutover (core + web + native)

1. Core consumers:
   - `account-actions.ts` `saveCashuAccount`: new id, `mintUrl`, no store;
   - `payment-preparation-actions.ts` `prepareCashuPaymentMethod`: no `whenHydrated`, and `CashuWalletNotSyncedError` goes;
   - `payment-actions.ts` `holdCashuReceive`;
   - `withdraw-cashu-actions.ts`;
   - `cashu-account-sync-job.ts` + the token listener;
   - `background-job-types.ts`;
   - `demo-data-generator.ts`;
   - `testing/cashu.ts`: Cashu database + fake mint, without the second "linkyWallet".
2. Web:
   - `use-app-run.ts`, `use-run-toast.ts`, `app-background-jobs.tsx`, `demo-data-seed.tsx`;
   - `features/shared/cashu/use-cashu-wallet.ts`: query key from `cashuEvolu.appOwner.id`, subscription through `cashuEvolu.subscribeQuery`;
   - payment-wait: the arrival state from `_cashuTokenArrival`;
   - `features/settings/cashu/*`, `features/withdraw/cashu-*`.
   - The debug card `cashu-shard-debug-card.tsx` is replaced by `cashu-wallet-debug-card.tsx` (owner id, sync state, balance per mint); the "write a test setting for Linky" button goes.
3. Native: the same files under `apps/native-app/src/…`.
   - `atoms/cashu.ts`, `features/shared/cashu/*`.
   - `features/preview/cashu-card.tsx`: drop the Linky vectors.
   - `ui-parity-map.ts` for the renamed debug card.
   - The source-text tests that expect `store.linkyAppOwner.id` / `cashuShardStore`.
4. Delete:
   - `cashu-shard-store.ts` (+ test), `linky-owners.ts`, `cashu-booking.ts`, `cashu-counters.ts`, `cashu-restore.ts`, `cashu-topup.ts`, `cashu-receive.ts`, `cashu-melt.ts`, `cashu-autoswap.ts`, `cashu-mints.ts`, `cashu-token-listener.ts` from `cashu/`;
   - `cashu-table-isolation.test.ts`, `cashu-cross-app.test.ts` (keep its NUT-18/BIP-321/mint-URL vectors as unit tests of `cashu-payment-request.ts` / `cashu-utils.ts`);
   - `evolu/device-cashu.ts` + the Cashu tables in `device-client.ts`;
   - the Linky tables in `evolu/schema.ts`;
   - `integrations/linky/linky-relays-client.ts`;
   - the `VITE_LINKY_*` / `EXPO_PUBLIC_LINKY_*` env vars;
   - the CLI comment "no Linky owners" in `cli-accounts.ts` and `background-jobs.test.ts`.
5. Rename the phase-2 files to their final names.

### Phase 4: Copy, docs, landing

- **i18n en/cs/sk:**
  - `settings.cashuAccount.wallet.*`, `.syncing`;
  - `settings.cashuMints.defaultWarning` (remove);
  - `settings.debugConsole.cashu.*`;
  - `withdraw.cashu.form.description`;
  - new copy for `receivedElsewhere` (another wallet received the token).
- **Landing:**
  - `landing.tech.services.linkyWallet.*` → Payky's own sync of the Cashu wallet;
  - `landing-tech-page.tsx`;
  - `landing-server.test.tsx`.
- **Docs:**
  - `AGENTS.md`: the `packages/core/src/cashu` entry, the rules for the four tables / `loadCashuWallet`, the `useCashuAppRun` rationale;
  - `docs/glossary.md`: drop "Linky owner" and `setting` vs `appSettings`; add "payment mint" and "Cashu database";
  - `docs/cashu.md`: rewritten as Payky's own specification;
  - `docs/cashu-plan.md`: deleted, or marked historical;
  - `docs/payment-sync.md`, `README.md` (key table), `apps/native-app/e2e/AGENTS.md`;
  - the decision records from phase 0 → final, with the old ones marked `Status: superseded by …`.

### Phase 5: E2E and manual checks

- Web `e2e/cashu.spec.ts` and the Maestro flows `apps/native-app/e2e/flows/cashu/*`. These mostly use `window.__e2eCashuMint` and should not need changes beyond the wiring.

## Verification

- `bun run check` after every phase. That covers lint, tsc, the decision-to-test mapping, Vitest, `feature-boundaries.test.ts`, `router.test.ts`, `ui-kit.test.ts` and `ui-parity.test.ts`.
- **Unit tests against the fake mint:**
  - topup: claim, lost response, expiry;
  - receive: fee, P2PK, spent, mint down;
  - melt: paid, unpaid, resume;
  - move: sweep;
  - counters: collision between two Payky devices, restore on first use;
  - booking: at completion, catch-up after a crash between batches, idempotence across two devices, move not booked.
- `cashu-live.test.ts` against `testnut.cashu.space` (`CASHU_LIVE`).
- E2E: `bun run test:e2e -- cashu`, `bun run test:e2e:native:web`.
- **Manual:**
  1. Two devices with one master key: enable Cashu on A; B sees the account and the balance (sync of the Cashu database over Payky's relays).
  2. Pay over Lightning and with a token from another wallet; the payment is paid and booked once.
  3. Linky running on the same key takes the token first: the payment stays unpaid and the wait screen says so.
  4. An account without Cashu makes no request to a mint or to the Cashu owner's relay (`landing/0009`).
  5. Withdraw to a Lightning address, and move funds between mints.
