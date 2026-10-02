# 0001 A cash sale reports the cash received

Status: accepted
Date: 2026-09-28

## Context

EET records the amount actually received, not the amount charged. A 78.90
CZK bill paid in cash is recorded as 79 CZK when rounded to whole crowns, or
as 80 CZK when the customer does not want the change back (GFŘ seminar for
developers, slide 59).

## Decision

Marking a payment paid in cash asks for the cash received, prefilled with
the charge rounded (see payment/0002). The sale reports that amount, less a
tip that belongs to employees (see eet/0005). It is stored on the payment's
cash detail, while the payment, its claim and the cash register transaction
keep the charge.

## Alternatives considered

Writing the received amount as the cash register transaction. The register
would be exact, but every rounding would show the bill overpaid, or
underpaid and still open, and ask staff to deal with the difference.

## Consequences

The cash register balance drifts from the cash in the drawer by the rounding
differences, and no view shows that drift. The payment detail shows a
payment's cash received when it differs from the charge. A cash payment
settled before the received amount was recorded reports its charge. With a
tip, the cash above the goods in whole crowns is the tip (see payment/0003).

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > createEetSale > reports what was received for $name`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > leaves the tip out of the cash received while tips belong to employees`
- `src/core/modules/payment/payment-actions.test.ts > payment actions > cash received > stores the cash received and keeps the charge everywhere else`
- `e2e/eet.spec.ts > a cash sale is reported as the cash received`
