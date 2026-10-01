# 0002 CZK cash rounds to the whole crown, and that is the least accepted

Status: accepted
Date: 2026-09-28

## Context

The seminar's example rounds 78.90 CZK paid in cash to 79 CZK (GFŘ seminar
for developers, slide 59). Payky has no cash rounding rule for any other
currency.

## Decision

A CZK charge rounds to the nearest whole crown, halves up, and the cash
received cannot be lower than that. Any other currency is prefilled with the
exact charge.

## Alternatives considered

Accepting any amount. Rounding down to whole crowns is the only legitimate
way to receive less than the charge, and anything lower is an underpayment
this field must not hide.

## Consequences

Staff can raise the amount when the customer leaves the change, never lower
it below the rounded charge.

## Enforced by

- `src/core/modules/payment/payment-cash-utils.test.ts > roundCashAmount > rounds %i CZK minor units to %i`
- `src/core/modules/payment/payment-cash-utils.test.ts > roundCashAmount > keeps any other currency exact`
- `src/core/modules/payment/payment-actions.test.ts > payment actions > cash received > refuses less than the charge rounded to whole crowns`
