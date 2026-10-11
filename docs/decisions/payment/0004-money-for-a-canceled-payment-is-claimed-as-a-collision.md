# 0004 Money that arrives for a canceled payment is claimed, as a collision

Status: accepted
Date: 2026-10-11

## Context

A customer can still pay after staff canceled the payment: a bank transfer
sent with the payment's symbols, or a Lightning invoice paid late. The bank
and Spark sync jobs match each incoming transaction to a payment
automatically (`reconcileAccountTransaction`). Payky already models a payment
that is both canceled and claimed: it displays as Canceled, its money counts
toward the bill, and staff resolve it with
`confirmPaymentPaidDespiteCancellation` (docs/bill-payment-states.md).

The matcher took the matching payment with the lowest id. When a live and a
canceled payment matched the same transaction — the same symbols and amount —
the canceled one could take money meant for the live one. It also skipped any
payment that had ever had a claim, so one whose claim or claimed transaction
had been deleted was never matched again.

## Decision

The automatic matcher keeps a canceled payment as a candidate, so money that
arrives after a cancellation is claimed and surfaces as the canceled+claimed
collision instead of staying unmatched. Among matching payments it prefers a
live one and takes a canceled one only when no live one matches. A payment
counts as already paid only through an active claim on a transaction that
still exists, the same definition as everywhere else.

Confirming money by hand (`markPaymentPaidCash`, `markPaymentPaidIban`) on a
canceled payment is refused with `PaymentCanceledError`: the person who
canceled it would be contradicting their own decision. A card terminal's
result is not refused, because the card has already been charged.

## Alternatives considered

Excluding canceled payments from the matcher. The transfer would then match
nothing and the money would be visible only as a stray transaction, with no
bill telling staff to return it.

Refusing every recording on a canceled payment, the card result included. A
charged card would then have no record in Payky.

## Consequences

A late payment for a canceled bill shows up as a collision staff have to
resolve, typically by refunding it. Two payments with the same symbols and
amount, one live and one canceled, no longer depend on their random ids. The
cashier cannot record cash or a transfer on a canceled payment, so a payment
called off by mistake needs a new payment.

## Enforced by

- `src/core/modules/reconciliation-claim/reconciliation-claim-actions.test.ts > reconciliation candidates > a transfer for a canceled payment is still claimed, as a collision`
- `src/core/modules/reconciliation-claim/reconciliation-claim-actions.test.ts > reconciliation candidates > a live payment takes the transfer before a canceled one that sorts first`
- `src/core/modules/reconciliation-claim/reconciliation-claim-actions.test.ts > reconciliation candidates > a payment whose claim was deleted is matched again`
- `src/core/modules/reconciliation-claim/reconciliation-claim-actions.test.ts > reconciliation candidates > a payment whose claimed transaction was deleted is matched again`
- `src/core/modules/payment/payment-actions.test.ts > payment actions > refuses to mark a canceled payment paid by hand`
