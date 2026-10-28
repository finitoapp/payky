# 0013 The default mint is the trusted mint chosen last

Status: accepted
Date: 2026-10-28

## Context

`cashu/0002` took the default mint from Linky's wallet setting. With a
wallet of Payky's own (cashu/0012) the default is Payky's, and the merchant
trusts several mints next to it (cashu/0017). A default kept on the account
and trust kept in the `cashuMint` rows could disagree: an untrust on one
device and "use for payments" on another, made concurrently, would leave the
default at a mint nobody trusts (`docs/plans/cashu-trusted-mints.md`, D1).

Payky also picks a default itself: the seed when Cashu is enabled, and the
fallback a payment is quoted at when the merchant chose none. Written as a
fresh choice, it overrode the merchant: a device whose sync had delivered
the Cashu account but not yet its mints took a payment and enabled Cashu
again, and once the mints arrived its writes had made `MAIN_MINT_URL`
trusted and the default on every device (finding 2 of the PR #172 review).

## Decision

- The default mint is the trusted `cashuMint` row with the greatest
  `defaultedAt`; a tie goes to the smaller URL, so every device picks the same
  one. `accountCashu.mintUrl` is gone.
- It is a timestamp and not a flag because Evolu merges cell by cell: two
  devices choosing different mints offline would leave two flags set, while
  the newest timestamp wins everywhere and the old default needs no second
  write.
- The merchant's choice writes `defaultedAt = max(now, newest known + 1)`, so
  it is later than every earlier one even when another device's clock ran
  ahead. For a mint already trusted it writes only `defaultedAt`, so an
  untrust made meanwhile keeps its own cell: the mint ends up untrusted and
  the previous default takes over.
- Only a trusted mint becomes the default. Untrusting the default hands it to
  the next newest choice, written as a choice in the same batch: every device
  then reads the same default, and the untrusted mint, trusted again later,
  is older than its successor and does not take the default back.
- A default Payky picks itself is the weakest choice: `defaultedAt` is
  `WEAKEST_DEFAULTED_AT` (0), below every real choice, and `isDeleted` is
  never written, so it overrides neither a choice nor an untrust made on
  another device. Two such defaults are:
  - the seed: enabling Cashu writes `MAIN_MINT_URL` when no trusted mint was
    chosen yet, in the batch that enables the account; enabling again keeps
    the merchant's choice;
  - the fallback: with no chosen trusted mint the default reads as the newest
    trusted mint, else `MAIN_MINT_URL`, and preparing a payment writes it in
    the payment's batch, so every device quotes at the same mint from then
    on.
- A payment is quoted at the default and keeps the mint its quote is at
  (`paymentCashu.mintUrl`); "move funds" targets the default.

## Alternatives considered

- A default on the account (`accountCashu.mintUrl`): a single cell merges
  correctly, but the default and trust would sit in two rows that disagree.
- A boolean `isDefault` on `cashuMint`: concurrent choices leave two defaults.
- Writing the seed and the fallback as a fresh choice: a device in a partly
  delivered sync overrides the merchant's default and trust.
- Not writing the fallback at all: devices that saw different trusted rows
  could quote at different mints until the merchant chooses.

## Consequences

- A weakest write still sets the `defaultedAt` cell of its mint: if that mint
  was a real choice on another device, Evolu keeps the later write, 0, and the
  default moves to the next newest real choice. Only a mint the device took
  for the fallback is affected, and the merchant's next choice settles it.
- Payment preparation reads the trusted mints for the mint it quotes at, next
  to the topup it writes.

## Enforced by

- `packages/core/src/modules/cashu/cashu-utils.test.ts > the default mint (cashu/0013) > the newest choice wins`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the default mint (cashu/0013) > a tie goes to the smaller URL, so every device picks the same one`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the default mint (cashu/0013) > with no choice the newest trusted mint stands in, then MAIN_MINT_URL`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the default mint (cashu/0013) > a new choice is later than one written by a clock running ahead`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the default mint > enabling Cashu seeds MAIN_MINT_URL once, and enabling again keeps the merchant's choice`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > the default mint > only a trusted mint becomes the default`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > untrusting the default writes the hand-off as a choice`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > enabling Cashu again keeps an untrusted MAIN_MINT_URL untrusted`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > different defaults chosen offline merge into the newer one`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > an untrust on one device beats a choice of the same mint on the other`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > two devices of one account > a device that has the Cashu account but not yet its mints overrides neither the default nor trust`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes at the default mint`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes at a fallback nobody chose and writes it as the weakest choice in the payment's batch`
