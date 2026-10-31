# 0036 A payment's holds are rows it only gains

Status: accepted
Date: 2026-10-29

## Context

A Cashu booking carries no payment id. A topup's transaction names its mint
quote, a token's names its receive (`cashu/0005`), and the claim finds the
payment that holds that quote or that receive. The payment held both in one
cell each, `paymentCashu.quoteId` and `paymentCashu.receiveOperationId`, and
Evolu keeps the later write of a cell (`cashu/0012`). Three writes took a
hold away before its money was booked:

- A new quote: the merchant asks for one after the payment expired. Preparing
  again wrote the new quote and `receiveOperationId: null`. A token still
  being received past the grace (`cashu/0017`, `0033`, `0035`) was booked
  unclaimed, and so was a late Lightning payment of the old invoice.
- Two devices opening the Cashu tab on one payment before it synced: each
  prepared a quote of its own and showed its QR. The customer paid one; the
  other device's quote won the cell, and the paid one was booked unclaimed.
- A second token for one payment: its hold replaced the first one's. When
  the second never completed (spent elsewhere, refused), the first was booked
  unclaimed.

Each time the sats were in the wallet and the payment stayed unpaid,
inviting the customer to pay again. Since `cashu/0029` a token's outcome can
come long after the payment expired, so these windows are no longer short.

## Decision

- A payment's holds are rows of their own: `paymentCashuQuoteHold` names a
  mint quote at its mint, `paymentCashuReceiveHold` a token's receive. A
  hold's id derives from the payment and what it holds, so two devices
  writing the same hold write one row. A hold is only ever added, never
  overwritten or deleted; a deleted payment hides its holds.
- Preparing the Cashu method adds a hold of its quote in the batch that
  writes the quote. A token sent for the payment adds a hold of its receive
  before anyone receives it (`cashu.md` §5).
- The claim of a Cashu booking (`cashu/0005`, `0028`) and the payment a
  token's arrival is shown on (`cashu/0034`) are found through the holds.
  `paymentCashu` keeps the quote the wait screen shows now, which a new
  preparation may overwrite; it no longer decides what pays the payment.
- `paymentCashu.receiveOperationId` is neither read nor written. Evolu cannot
  drop a column. Payments prepared before this record have no holds.

## Alternatives considered

- Never writing `receiveOperationId: null` on a new quote: it saves the
  token's hold, but not the replaced quote's, and not one device's write
  over another's.
- Keeping the old quote beside the new one in a second column: a third
  preparation, or a third device, loses it again.
- Dropping the old quote's money on purpose, as a Lightning address drops
  its old invoice (`lightning-address/0004`): a Cashu topup is booked
  whatever happens (`cashu/0005`), so leaving it unclaimed only hides money
  that arrived for the payment.

## Consequences

A payment is paid by any quote or token it ever held, an old quote after a
new one included. A payment that already has money against it still takes
nothing more (`cashu/0005`): of two tokens, the first one booked pays it and
the other stays unclaimed for the merchant to settle.

The claim queries look the holds up per payment instead of joining one cell,
one indexed lookup more per candidate.

## Enforced by

- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a payment is paid by every hold it was given (cashu/0036) > money for a quote that another preparation replaced is claimed for the payment`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a payment is paid by every hold it was given (cashu/0036) > a token held before a new quote still pays the payment`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a payment is paid by every hold it was given (cashu/0036) > a second token never takes the first one's hold away`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes the payment mint, writes the topup, the paymentCashu row and the payment's expiry`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > an outcome reached after the payment expired is still shown on it`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a payment is paid by every hold it was given (cashu/0036) > a quote id is unique only within its mint: money for the same id at another mint is not claimed for the payment`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a Lightning payment a contest gave to no one is shown on its payment (cashu/0029) > a contested topup at another mint with the payment's quote id is not the payment's`
