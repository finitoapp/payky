# 0003 A Cashu payment method is its own payment detail

Status: accepted
Date: 2026-10-14

## Context

Cashu is a separate payment method next to Spark (`cashu.md`, decision 4).
`paymentBtc` and `paymentBtcLightning` hold one account, one sats amount and
one invoice per payment, and Spark's reconciliation joins on
`paymentBtc.accountId`. A payment can have both prepared.

## Decision

- `paymentCashu`, keyed by the payment id, holds the Cashu method: its
  account, sats and the Yadio rate as `paymentBtc` does, the mint, the mint
  quote's id, invoice and expiry, and the token receive the payment holds.
  It does not extend `paymentBtc`; Spark's tables and queries are untouched.
- Preparing it writes `payment.expiresAt` from the quote's expiry under the
  same rule a Spark preparation follows: no expiry while a non-expiring
  method is prepared. With Spark and Cashu both prepared, the last
  preparation sets it.
- The tab's QR is a BIP-321 `bitcoin:?lightning=` URI rebuilt from the
  stored invoice, built as Linky's `buildBip321PaymentUri` builds it.

## Alternatives considered

Extending `paymentBtc`: preparing Cashu would overwrite Spark's row and break
its reconciliation.

## Consequences

Money that arrives after the payment shows expired still settles: the claim
matches by quote id (cashu/0005).

## Enforced by

- `src/core/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > quotes the default mint, writes the topup, the paymentCashu row and the payment's expiry`
- `src/core/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > leaves Spark's rows alone when both are prepared`
- `src/core/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > refuses a payment of nothing`
- `src/core/modules/cashu/cashu-cross-app.test.ts > cross-app Cashu vectors (shared with Linky) > BIP-321 $uri`
- `e2e/cashu.spec.ts > enable Cashu, take a payment over the mint's invoice and see it settle`
