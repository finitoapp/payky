# 0003 In cash, the tip is what the customer gave above the goods in whole crowns

Status: accepted
Date: 2026-10-02

## Context

A CZK cash total is rounded to the whole crown (see payment/0002), and EET
records the amount actually received (GFŘ seminar for developers, slide 59).
Cash received in whole crowns is recorded in whole crowns, and a card
payment to the haléř (GFŘ guideline on the EET act, version 2.0, page 26,
written for the first EET).
A tip that is an employee's income is not a reported sale (slide 65). When
it is paid in one payment with the meal, the part that is the tip need not
be recorded, though the whole amount may be (the same guideline, page 10).
A cash payment with a tip is rounded as a whole, so the tip chosen and the
cash received rarely leave goods in whole crowns.

## Decision

When a payment with a tip is settled in cash with a received amount, its
goods are its amount less the tip, rounded to the whole crown, 50 haléř up,
and its tip is the rest of the cash received. While tips belong to employees
the sale reports those goods. While they belong to the business it reports
the whole cash received, with that tip as its reported tip. A refund of goods
is limited to those goods and the tip refund returns that tip, whose
reversal covers no more than it returned. A payment without a tip keeps the
whole cash received as goods.

## Alternatives considered

Taking the chosen tip off the cash received, as before. A 58.28 payment with
a 2.78 tip paid with 58 reported 55.22, so the rounding came off the goods
and a cash sale reached EET in haléř. Keeping the goods exact and the rest
as the tip, which would report 55.50 for a cash sale. Reporting the whole
cash received while tips belong to employees, which the guideline allows
but which is what tips that belong to the business already do.

## Consequences

The payment detail shows the tip received, which can differ from the tip
chosen. Change the customer leaves on a payment with a tip goes to the tip,
and on a payment without one stays a sale (slide 59). A cash payment settled
before the received amount was recorded keeps the tip chosen. A sale created
before this rule reports the tip chosen, and only the part refunded is
reversed.

## Enforced by

- `src/core/modules/payment/payment-cash-utils.test.ts > deriveReceivedTipAmount > takes $tipReceived as the tip of $amount with $tip tip and $received received`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > reports the goods in whole crowns when cash takes part of the tip`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses no more of a tip than its refund returned`
- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > split cash into the goods in whole crowns and the tip`
- `src/core/modules/refund/refund-utils.test.ts > deriveRefundableTipAmount > offers the tip the cash brought above the goods in whole crowns`
