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
| `cashuProof` | One proof; id = `createIdFromString(secret)`; `isSpent`, only ever set; `operationId` of the melt holding it. Its state is read from the two: `spent`, else `held`, else `available` (cashu/0024) | synced |
| `cashuOperation` | Root of every operation: `kind` `topup`/`receive`/`melt`, `status`, `mintUrl`, `amount`, `keysetId`, `error`, `settledAt` | synced |
| `cashuTopup` | `quoteId`, `lnInvoice`, `expiresAt`, `locked`, `purpose` `payment`/`move` | synced |
| `cashuReceive` | `tokenText`, `fee` (known before the swap) | synced |
| `cashuMelt` | `quoteId`, `lnInvoice`, `feeReserve`, `inputsTotal`, `purpose` `withdrawal`/`move` | synced |
| `cashuMove` | Links a move's melt at the source to its topup at the target | synced |
| `cashuMintTrust` | The account's one row: the trusted mints as one JSON list, the default first, and the mint enabling Cashu seeded, read only while no list was written (cashu/0016, cashu/0013) | synced |
| `_cashuCounter` | This device's NUT-13 counter per `mint|sat|keysetId` | local |
| `cashuOperationAttempt` | One call's NUT-13 slots for an operation, by any device: `operationId`, `keysetId`, `counter`, `slots` (exactly the outputs the prepared call asks for), `role` (`mint`, `swap`, `meltSwap`, `meltChange`, cashu/0039); written once, then only `isRejected` set when the mint refused its call, and `isContested` when a contest over its block gave outputs to no one (cashu/0029) | synced |
| `_cashuOwnAttempt` | The attempts this device made | local |
| `_cashuTokenArrival` | What the wait screen shows of a token sent for a payment | local |
| `_cashuMintCache` | A mint's info and keysets as cashu-ts last loaded them, so a wallet loads without asking the mint first | local |

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
  lazily. A mint's info and keysets are kept on the device, in the local-only
  `_cashuMintCache` (`cashu-mint-cache.ts`): a later session's wallet
  loads from them and refreshes from the mint behind. A melt waits for that
  refresh (`loadCurrent`), and trusting a mint asks it again (`refresh`)
  (cashu/0040).
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
  (cashu/0012). The trusted mints are one list in one cell of
  `cashuMintTrust` (cashu/0013), and the default mint is its first: "use for
  payments" moves a trusted mint to the front, trusting adds one at the end,
  untrusting removes one. Every write is the whole list, never empty, so a
  merge of two devices' changes is one of the two lists and never leaves no
  mint trusted; the other device's change is the one lost.
- Enabling Cashu on a device that knows no trusted mint seeds `MAIN_MINT_URL`
  in the batch that enables the account, in `seedMintUrl`, a cell of its
  own: it counts only while no device has written the list, so a device
  that has the account but not yet its mints overrides nothing. The seed is
  written only once every relay has completed a sync since the app started; enabled before
  that, the Cashu job writes it after, unless the merchant's list arrived
  first (`loadCashuMintSeedDue`, cashu/0013). A sync blocked by a relay
  this device cannot reach (`AppOwnerSyncDep` answers `blocked`) never
  counts as complete: the mints screens name the relay and offer the
  default mint, and the merchant's confirmation writes the seed
  (`seedCashuMintOnConfirm`, cashu/0013).
- `prepareCashuPaymentMethod` converts the fiat amount to sats over Yadio, as
  Spark does, takes the default mint (`loadDefaultCashuMint`), creates the
  quote there (locked to the nostr key when the mint lists NUT-20), and
  writes in one batch the pending `topup` with purpose `payment`,
  `paymentCashu`, the payment's hold of the quote (`paymentCashuQuoteHold`,
  cashu/0036), `payment.expiresAt` and an unchosen fallback default
  (cashu/0003). A device that knows no trusted mint yet, its mints not
  synced in, fails with `CashuMintsNotSynced` and quotes nothing, since
  `MAIN_MINT_URL` may be a mint the merchant untrusted (cashu/0018).
- The tab's QR is `bitcoin:?lightning=<bolt11>&creq=<creqA…>`, rebuilt from
  `paymentCashu` (cashu/0006). The Lightning leg is the payment's own mint's
  invoice. The NUT-18 request names the sats, `sat`, single use, the trusted
  mints (the default first, at most `NUT18_MAX_MINTS` = 3, cashu/0016), one
  nostr transport to Payky's nprofile tagged `["n", "17"]`, and the payment
  id. Until the trusted mints are read it names the payment's mint only;
  with none trusted it names no mint and the QR carries no request.
- What became of a token sent for the payment is read live from
  `_cashuTokenArrival`; until it is read the QR stays. An arrival that leaves
  the payment unpaid is said beside the QR, so the customer can pay another
  way: `untrustedMint`, `receivedElsewhere`, `failed`. One that has paid the
  payment or may still pay it replaces the QR, so the customer is not invited
  to pay twice: `receiving`, `waitingForMint`, `received`, and
  `receivingElsewhere`, another Payky device's pending receive of the token
  (cashu/0020).

## 5. The Cashu job

It runs on native and browser while the Cashu account is enabled, never in
the CLI.

| Part | What it does |
| --- | --- |
| Topups | Polls each pending topup on a schedule from its creation — 5 s for 5 minutes, 1 minute up to an hour, then 5 minutes — and claims a paid quote (`claimCashuTopup`). At a mint that pushes a mint quote's state (NUT-17) the job also subscribes to the pending quotes (`cashu-quote-watch.ts`); a quote pushed PAID only polls its topup at once, so the claim goes as a poll's would. A subscription opens behind the job's pass, never awaited by it; one that fails or ends is opened again on a later pass, after a wait that doubles up to 15 minutes, and a mint whose quotes are no longer watched has its socket closed. A move's topup is polled the same way, until it is claimed or the mint answers UNPAID past its expiry and a 5-minute grace for a clock ahead of the mint's (cashu/0021, cashu/0029). A claim another device makes is waited for; after 5 minutes it is taken over at that device's latest attempt — reclaimed if it minted, minted there if it never did (cashu/0017). A topup whose outputs a contest gave to no one is closed `done` with no booking, and its payment's wait screen says so (cashu/0029). |
| Claims | Each pass claims every Cashu transaction no claim holds while a payment holds its quote or receive id, any it was ever given (cashu/0036): a booking written on a device the payment had not reached yet (cashu/0025). |
| Melts | Melts still `pending` are resumed (`resumeCashuMelt`, under the counter lock), with the settlement of the withdrawal or move that owns them (`loadCashuWithdrawalSettlement`, `loadCashuMoveSettlement`), written in the same batch: this device's own at once, one another device sent past a 5-minute grace, settled only once the mint answers PAID, or UNPAID after the quote expired — this device's own too once its melt may have gone out (cashu/0027). A quote that states no expiry is closed on UNPAID once a 5-minute grace since the melt was written has passed and its inputs were swapped into outputs of its own, so no request still on its way can spend them (cashu/0027). Either way the mint, not the rows synced in, says which held proofs the melt spent, and the pre-swap's block is restored for the outputs no device stored (cashu/0019, cashu/0027). A melt whose counter lock another call holds, one this device is sending, is skipped for the pass instead of waited for, and a melt pending for long is resumed on the topups' backoff: every 5 s for its first 5 minutes, then every minute, then every 5 minutes after an hour. |
| Tokens | Reads 1:1 NIP-17 messages with a token (7-day window), matches each to the payment its NUT-18 payload names — a bare token pays no payment and is received unassigned (cashu/0028) —, makes the payment hold the receive id, and receives it; a message whose mint is down is tried again every 30 s, and a receive closed `failed`, by any device, once a run (cashu/0030). Payky receives from any mint trusted when the token is processed, and the money stays at that mint (cashu/0016). A token from a mint not trusted waits, checked each tick against the local trust list alone, and is received once its mint is trusted; a device that knows no trusted mint trusts none, not even `MAIN_MINT_URL` (cashu/0020). A token another device booked before the payment reached it is held and claimed by the payment its NUT-18 payload names (cashu/0025). |

### Claims and counters (cashu/0029, cashu/0017, cashu/0024, cashu/0031, cashu/0039)

- A claim re-reads the operation and re-checks the quote, then, under the
  counter lock, prepares its call and writes, in one batch, the attempt on
  record (`cashuOperationAttempt`: exactly the slots the prepared outputs
  take and the call's role, a row of this device's own even when another
  device reserved the same slots), this device's mark on it and the local
  counter past them — all before the mint is called (cashu/0039). An attempt is updated only to mark it refused, by the device
  whose call was refused, so no device's reservation or refusal erases
  another's.
- Taking the lock moves the counter past every block on record at the
  keyset, any device's (cashu/0031).
- It stops, writing nothing, when another device got there first: the
  operation is settled, or its attempts are all another device's, or the
  mint answers `ISSUED` and no attempt on record holds the proofs.
- A lost response, this device's or another's, is reclaimed through NUT-09
  over the block of every attempt on record the mint did not refuse: the
  seed is the account's, so any device derives any attempt's outputs. A
  signed block another open operation shares waits for it to close
  (`CashuReclaimAmbiguous`), unless that operation's block has its first
  slot unsigned: its call signed nothing there. A restore or reclaim writes
  each proof's identity alone, so it never undoes a hold or a spend
  (cashu/0029, cashu/0024).
- Past the grace a claim made elsewhere is taken over at that device's
  latest attempt: the same seed derives the same outputs, so the mint
  issues the quote once and NUT-09 recovers it on either device.
- Collisions (outputs signed, 11003 or the older 10002; outputs pending,
  11004; duplicate outputs, 11008) move the counter past the last signed
  slot (cashu/0037); a device's first use of a keyset restores it first.

### Receiving a token

`inspectCashuToken` reads the mint, face value and P2PK locks without asking
a mint, and refuses a token locked to another key. `receiveCashuToken` then
loads the mint, refuses a token whose proofs the wallet holds or whose fee
would eat it whole, checks NUT-07, and swaps under the counter lock, the
pending receive with its fee written in the batch that reserves the counter.
A pending receive no device reserved a counter for is taken over. A spent
token is first reclaimed from the attempts on record: this device's at once,
another Payky device's only past the 5-minute grace, counted from when the
listener first saw that device's latest attempt (cashu/0017), and counted on
through passes the mint did not answer (cashu/0017). Until then the
arrival is `receivingElsewhere` and the listener tries it again; past it,
Payky reclaims that device's swap, or swaps in its place a token it never
swapped. A token another wallet spent is `receivedElsewhere`: nothing is
written and the payment stays unpaid, and this device is done with the
message for the run (cashu/0030).

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
  that settles the melt (withdraw/0011, withdraw/0015, cashu/0027,
  cashu/0014). A quote is melted once: a melt already written for it is
  left to its resume, and the withdrawal's id derives from the melt, so a
  second confirm writes no second withdrawal (cashu/0041).
- A melt prices the quote and, under the counter lock, selects
  NUT-07-confirmed sources, only those that cover it (cashu/0026). It writes
  the pending melt with those sources `held` and the swap's slots reserved,
  swaps exactly what the melt needs, stores the swap's outputs with the
  melt's inputs `held`, and melts with NUT-08 blank outputs for the change. A
  lost response leaves it `pending`; resuming settles the payment already
  sent and never sends again. Once its request's slots are on record, a
  `meltChange` attempt, of no slots when it asks for no change (cashu/0039),
  the melt may have gone out, and UNPAID closes it only after the quote
  expired (cashu/0027). A refusal saying the melt may be paying — its
  quote pending or paid, its inputs pending — or one whose held inputs
  NUT-07 reports pending, leaves it to the quote's state the same way
  (cashu/0027). A melt the mint did not pay whose held sources
  are spent gets the swap's outputs back through NUT-09 at the reserved slots
  (cashu/0019). One whose pre-swap answer was lost and whose sources are
  still unspent swaps them into outputs of its own first, so the pre-swap
  can no longer sign when it arrives late (cashu/0019).
- Moving funds (cashu/0015) quotes a topup at the target and a melt at the
  source, writes the topup and the `cashuMove` link in one batch, melts, and
  claims the topup. It never takes more from the source than the total the
  merchant confirmed from the estimate: a price above it stops the move
  before anything is written or paid (`CashuMoveCostRose`, cashu/0023). A melt the source closes without paying closes the topup
  `failed` in its own batch; a move that fails before any melt is written
  closes it `failed` at once. A melt that may have been sent leaves it
  pending for the job (cashu/0021).

## 8. Mints (cashu/0015)

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
mint cannot be untrusted. Each of these writes the whole list (cashu/0013):
of changes made on two devices before they sync, the later list stands.

A device that knows no trusted mint has not synced the account's mints: it
trusts none and has no default, `MAIN_MINT_URL` included
(`trustedCashuMintsOf` and `pickDefaultCashuMint` return an empty list and
null). The mints screen says the mints have not synced in place of the
trusted section, and trusting, choosing or untrusting fails with
`CashuMintsNotSynced` and writes nothing: any list it wrote would replace
the merchant's (cashu/0018, cashu/0013).

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
