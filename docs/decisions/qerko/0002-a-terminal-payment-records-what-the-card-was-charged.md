# 0002 A terminal payment records what the card was charged

Status: accepted
Date: 2026-10-23

## Context

The terminal can charge more than the payment asked for: the customer may add
a tip on the terminal. Qerko reports the amount it charged, tip included, as
`chargedAmount`, apart from the `amount` Payky requested.

## Decision

The account transaction of an approved Qerko payment carries `chargedAmount`,
not `payment.amount`. A tip added on the terminal therefore reads as an
overpayment through the ordinary coverage rule, and the money in the account
matches what the card was charged. The approval is recorded even when the
payment was canceled meanwhile (payment/0004), because the card has been
charged.

## Alternatives considered

Recording `payment.amount` and treating the difference as a tip row, which
would leave the account short of what the acquirer settles.

## Consequences

`markPaymentPaid` takes an optional `chargedAmount`. The tip charged is kept
on the payment's Qerko row (`chargedTipAmount`).

## Enforced by

- `packages/core/src/modules/payment/payment-qerko-actions.test.ts > qerko terminal payment > an approved payment settles what the card was charged, a terminal tip included`
- `packages/core/src/modules/payment/payment-qerko-actions.test.ts > qerko terminal payment > an approval that arrives after the payment was canceled still records the money`
