# 0004 A Lightning address payment method is its own payment detail

Status: accepted
Date: 2026-10-25

## Context

The Lightning address method sits next to Spark, as Cashu does (cashu/0003).
`paymentBtc` and `paymentBtcLightning` hold one account, one sats amount
and one invoice per payment, and Spark's reconciliation joins on them. A
payment can have both prepared, each quoted when its tab opened, at a
different rate.

## Decision

- `paymentLightningAddress`, keyed by the payment id, holds the method: its
  account, sats and the Yadio rate, the invoice (lowercased), its payment
  hash, verify URL and expiry, and the preimage once verified. Spark's
  tables are untouched.
- Preparing it sets `payment.expiresAt` to the invoice's expiry under the
  rule a Spark preparation follows: no expiry while a non-expiring method
  is prepared, and the earlier one when both are prepared at once.
- A settling transaction converts back to the payment's currency at the
  quote of its own method, picked by the transaction's kind
  (`quotedAmountSats`): a Lightning address settlement at this row's sats.
- A withdrawal refuses to pay this invoice as it refuses Spark's
  (withdraw/0006).

## Alternatives considered

Extending `paymentBtc`: preparing one method would overwrite the other's
row, and a settlement would be measured by the wrong quote.

## Consequences

The bill's coverage, refunds, EET and statistics read the same per-kind
quote, so a payment prepared on both tabs is not shown a few minor units
under- or overpaid.

## Enforced by

- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > preparePaymentMethod with a Lightning address > asks the merchant's wallet for an invoice and expires with it`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > preparePaymentMethod with a Lightning address > keeps a withdrawal from paying the invoice back out`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > settles the payment with the preimage that proves it`
- `packages/core/src/modules/shared/claimed-amount.test.ts > quotedAmountSats > measures a Lightning address settlement by its own quote`
