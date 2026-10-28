# Cashu payments

A merchant takes a BTC payment over Cashu ecash. Payky shows one QR code and
the customer only scans it: their wallet either pays the Lightning invoice
the mint issues (NUT-04), or sends a Cashu token for the NUT-18 payment
request next to it. The ecash lives in Payky's own Cashu wallet, which syncs
between the account's devices; it can be moved between mints and withdrawn
to Lightning.

The business rules are the `docs/decisions/cashu/` records, from
`cashu/0012` on; this document describes how the code holds them. The plan
that moved the wallet out of Linky's format is `docs/plans/cashu-own-wallet.md`;
`cashu/0012` moved it into the app database.

## 1. Identity

Everything derives from the account's master key
(`packages/core/src/modules/shared/key-derivation.ts`, README "Keys"):

| What | Path | Use |
| --- | --- | --- |
| Cashu wallet seed | `m/83696968'/128169'/64'/0'` | BIP-85 HEX, 64 bytes, the NUT-13 seed with no mnemonic in between (`deriveCashuWalletSeed`) |
| Nostr key | `m/44'/1237'/0'/0/0` | NIP-17 inbox for tokens, NUT-20 quote locks, NUT-11 P2PK; the same npub Linky uses |

Linky derives nothing under `128169'`, so Payky's wallet and Linky's never
derive the same secrets. The nostr key is shared on purpose; §6 says what
that costs.

## 2. The wallet in the app database

The wallet's tables are ordinary app-database tables under the app owner
(cashu/0012), registered in `evolu/schema.ts` like every other domain table.
They sync with the rest of the account's backup, over its relays and under
its identifier, whether Cashu is enabled or not; an account that never
enabled Cashu has no Cashu rows (landing/0013). Tasks reach them through
`EvoluDep` and write with `owner: evoluOwner`; React reads them with
`useEvoluQuery`.

What stays apart is the cashu-ts wallet: `cashuWalletDepAtom` on web and
native loads it lazily, `useCashuAppRun` adds it to a run only when one is
made, and the Cashu job runs under a boundary of its own, so a mint or the
SDK crashing it stops no other job.

Tables (`modules/cashu/cashu.ts`):

| Table | What | Sync |
| --- | --- | --- |
| `cashuProof` | One proof; id = `createIdFromString(secret)`; `state` `available`/`held`/`spent`; `operationId` of the melt holding it | synced |
| `cashuOperation` | Root of every operation: `kind` `topup`/`receive`/`melt`, `status`, `mintUrl`, `amount`, `keysetId`, `counter`, `error`, `settledAt` | synced |
| `cashuTopup` | `quoteId`, `lnInvoice`, `expiresAt`, `locked`, `purpose` `payment`/`move` | synced |
| `cashuReceive` | `tokenText`, `fee` (known before the swap) | synced |
| `cashuMelt` | `quoteId`, `lnInvoice`, `feeReserve`, `inputsTotal`, `purpose` `withdrawal`/`move` | synced |
| `cashuMove` | Links a move's melt at the source to its topup at the target | synced |
| `cashuMint` | A mint the merchant trusts, with `defaultedAt` when it was last chosen as the default; a tombstone is a mint no longer trusted (cashu/0017, cashu/0013) | synced |
| `_cashuCounter` | This device's NUT-13 counter per `mint|sat|keysetId` | local |
| `_cashuClaimAttempt` | The counter this device reserved for an operation | local |
| `_cashuTokenArrival` | What the wait screen shows of a token sent for a payment | local |

Operation ids derive from what they are about, so two devices write one row
(`cashu-utils.ts`): `topup|<mint>|<quoteId>`, `receive|<tokenText>`,
`melt|<mint>|<quoteId>`. A token's text is normalised by
`normalizeCashuTokenText` first; a mint URL by `normalizeMintUrl`.

## 3. Code layout

- `packages/core/src/cashu/` wraps the SDK, as `spark/` does:
  `cashu-wallet.ts` (`CashuWalletDep`, `loadCashuWallet`, `callMint`,
  `classifyMintError`, the foreign-keyset guard, `CashuDeps`),
  `cashu-payment-request.ts` (NUT-18, BIP-321) and `fake-cashu-mint.ts`.
  Nothing else constructs a cashu-ts `Wallet` or `Mint`; cashu-ts is imported
  lazily.
- `packages/core/src/modules/cashu/` is the domain: `cashu-types.ts`,
  `cashu-errors.ts`, `cashu-queries.ts`, `cashu-utils.ts`, `cashu-guards.ts`,
  and one `cashu-*-actions.ts` per concern (proofs, counters, topup, receive,
  melt, move, mint, booking, token arrival).
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.ts` and
  `cashu-token-listener.ts` are the job (§5).

Every state transition is one `runMutationWithCompletion` batch: the proofs
and the operation's status together, with the app rows the transition
implies — a booking, a withdrawal's movement, a payment's `paymentCashu` —
so a crash leaves either the old state or the new one. A Task from another
module joins such a batch through a load Task and a plain upsert
(`requestCashuTopupQuote`/`upsertCashuTopupRows`, `loadCashuBooking`/
`upsertCashuBooking`), or, for a melt, through a `CashuMeltSettlement` its
owner hands to `meltCashu`.

## 4. Payment method

- `accountCashu` holds no mint; its id is the constant `account:cashu`
  (cashu/0012). The default mint (cashu/0013) is the trusted `cashuMint` row
  with the newest `defaultedAt`, a tie going to the smaller URL; "use for
  payments" on a trusted mint writes a new `defaultedAt`, later than every
  earlier one. Enabling Cashu seeds `MAIN_MINT_URL`, in the batch that
  enables the account, unless a trusted mint was chosen already.
- A default Payky picks itself — that seed, or the fallback a payment is
  quoted at when nothing was chosen — is written as the weakest choice:
  `defaultedAt` 0 and no `isDeleted`, so a device that has the account but
  not yet its mints overrides neither a choice nor an untrust made elsewhere.
- `prepareCashuPaymentMethod` converts the fiat amount to sats over Yadio, as
  Spark does, takes the default mint (`loadDefaultCashuMint`), creates the
  quote there (locked to the nostr key when the mint lists NUT-20), and
  writes in one batch the pending `topup` with purpose `payment`,
  `paymentCashu`, `payment.expiresAt` and an unchosen fallback default
  (cashu/0003).
- The tab's QR is `bitcoin:?lightning=<bolt11>&creq=<creqA…>`, rebuilt from
  `paymentCashu` (cashu/0006). The Lightning leg is the payment's own mint's
  invoice. The NUT-18 request names the sats, `sat`, single use, the trusted
  mints (the default first, at most `NUT18_MAX_MINTS` = 3, cashu/0017), one
  nostr transport to Payky's nprofile tagged `["n", "17"]`, and the payment
  id. Until the trusted mints are read it names the payment's mint only.
- What became of a token sent for the payment replaces the QR, read live
  from `_cashuTokenArrival`; until it is read the QR stays.

## 5. The Cashu job

It runs on native and browser while the Cashu account is enabled, never in
the CLI.

| Part | What it does |
| --- | --- |
| Topups | Polls each pending topup on a schedule from its creation — 5 s for 5 minutes, 1 minute up to an hour, then 5 minutes — and claims a paid quote (`claimCashuTopup`). A move's topup older than a day is left alone. A claim another device makes is waited for; after 5 minutes it is reclaimed from the synced counter. |
| Melts | Melts this device sent that are still `pending` are resumed (`resumeCashuMelt`), with the settlement of the withdrawal or move that owns them (`loadCashuWithdrawalSettlement`, `loadCashuMoveSettlement`), written in the same batch. |
| Tokens | Reads 1:1 NIP-17 messages with a token (7-day window), matches each to a payment, makes the payment hold the receive id, and receives it; a message whose mint is down is tried again every 30 s (cashu/0008). Payky receives from any mint trusted when the token is processed, and the money stays at that mint (cashu/0017). |

### Claims and counters (cashu/0015)

- A claim re-reads the operation and re-checks the quote, then reserves a
  block of 64 NUT-13 slots under the counter lock and writes, in one batch,
  this device's attempt, the operation's synced `counter` and the local
  counter past the block — all before the outputs are derived.
- It stops, writing nothing, when another device got there first: the
  operation is `done`, or carries a counter this device did not reserve, or
  the mint answers `ISSUED` for a quote this device has not minted.
- A lost response is reclaimed through NUT-09 over the recorded slot.
- Collisions (11003, 11005, 11008, 11004) move the counter past the last
  signed slot; a device's first use of a keyset restores it first.

### Receiving a token

`inspectCashuToken` reads the mint, face value and P2PK locks without asking
a mint, and refuses a token locked to another key. `receiveCashuToken` then
loads the mint, refuses a token whose proofs the wallet holds or whose fee
would eat it whole, checks NUT-07, writes the pending receive with its fee,
and swaps under the counter lock. A token another wallet already spent is
`receivedElsewhere`: nothing is written and the payment stays unpaid.

### Booking (cashu/0014)

An incoming operation is booked in the batch that completes it:
`accountTransaction` + `accountTransactionCashu` + the automatic claim, under
`accountTransaction:cashu:<operationId>`, next to the proofs and `done`.
`loadCashuBooking` reads what the booking needs — the payment holding the
quote, the bill's close time — before the batch, and skips a transaction
another device wrote. The amount is the topup's amount or the token's face
value less its stored fee. A move's topup and melts are not income; a
withdrawal books its own movement in the batch that settles its melt. There
is no catch-up: every device that completes an operation books it.

## 6. Linky on the same npub

Customers send NUT-18 tokens to the primary npub, which Linky also holds. A
running Linky auto-accepts tokens into its own wallet, so when it is quicker
Payky's swap meets an already spent token: the arrival is
`receivedElsewhere`, the payment stays unpaid, the wait screen says another
wallet received the token, and the merchant settles it — the money is in
their Linky. The recommendation is not to run Linky on the same key while
working the till.

## 7. Withdraw and moves

- `quoteCashuWithdrawal` prices a withdrawal from one mint to a Lightning
  invoice or address; `executeCashuWithdrawal` records the withdrawal before
  any money leaves, then melts, its movement or failure written in the batch
  that settles the melt (withdraw/0011, withdraw/0013, withdraw/0015,
  cashu/0014).
- A melt prices the quote, selects NUT-07-confirmed sources, swaps exactly
  what the melt needs, persists the pending melt with its inputs `held`, and
  melts with NUT-08 blank outputs for the change. A lost response leaves it
  `pending`; resuming settles the payment already sent and never sends again.
- Moving funds (cashu/0016) quotes a topup at the target and a melt at the
  source, writes the topup and the `cashuMove` link in one batch, melts, and
  claims the topup. A melt the source does not pay closes the topup `failed`
  in its own batch.

## 8. Mints (cashu/0016)

The mints screen has three sections: the trusted mints
(`cashuTrustedMintsQuery`), the default first with its badge; the mints not
trusted that still hold a balance; and the preset mints in neither, as
suggestions. A mint named only by spent proofs or finished operations is not
listed. A suggestion opens the mint's detail, where "Trust" adds it;
adding or trusting checks that the mint loads and lists no other mint's
keyset (`trustCashuMint`). "Use for payments" is offered on a trusted mint
only (`setDefaultCashuMint`). Untrusting (`untrustCashuMint`) is allowed with
a balance, which stays to move or withdraw; untrusting the default hands it
to the previous choice, which the confirmation names, and the last trusted
mint cannot be untrusted. A choice writes only `defaultedAt` on a trusted
mint, so an untrust made meanwhile on another device wins.

## 9. Testing

- `testing/cashu.ts` (`createCashuTest`) opens an app Evolu in memory, with
  fake mints behind `fetch`; `otherDevice()` opens a second device of the
  same account (its own app database), `createTestCashuCustomer` a
  customer's wallet, and `watchTestQuery` records every state the database
  passes through, for asserting that two writes are one batch.
- `cashu-live.test.ts` runs against testnut with `CASHU_LIVE=true`.
- E2E (`apps/web-app/e2e/cashu.spec.ts`, `apps/native-app/e2e/flows/cashu/`)
  set `window.__e2eCashuMint`: an in-app fake mint the wallet talks to.
- `testing/evolu-relay.ts` (`createTestRelay`) runs a real Evolu relay in
  memory on a free port; with `createWebSocket` passed to `createCashuTest`
  or `createEvoluTest`, two devices of one account sync through it.
- Manual only: a real Linky on the same key racing for a token (§6).
