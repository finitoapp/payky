# 0001 A refund is its own record, the payment stays paid and the bill stays closed

Status: accepted
Date: 2026-09-29

## Context

Money returned for a reported sale is reported as a storno with a negative
amount (see eet/0007). The guideline for the first EET required a sale
returned in cash to be recorded that way (GFŘ methodological guideline to
the law on sales records, version 1.0 of 31 August 2016, chapter 2.2.3).
Payky had no refund at all.

## Decision

A refund is a separate record: payment, amount, method, time, device and
refunded lines. The payment stays paid, its claims stay, and its bill stays
closed and covered. The payment detail, the bill's payment rows and the
payment history show it as partly or fully refunded. A cash refund leaves
the cash register as a transaction no payment claims.

## Alternatives considered

A negative payment. It would flow into coverage, payment numbering,
reconciliation and every payment list. Subtracting refunds from coverage. It
turns a closed bill underpaid, which means reopening it, editing locks and a
second settlement flow.

## Consequences

Refunds add a display, not a state. `docs/bill-payment-states.md` describes
it.

## Enforced by

- `src/core/modules/refund/refund-actions.test.ts > refundPayment > keeps a fully refunded payment paid and its bill closed and covered`
- `src/core/modules/refund/refund-actions.test.ts > refundPayment > returns a payment in parts outside Payky without moving any account`
- `e2e/eet.spec.ts > refunds of a paid bill reach EET as negative sales`
