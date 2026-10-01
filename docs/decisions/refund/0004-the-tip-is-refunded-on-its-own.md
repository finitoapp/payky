# 0004 The tip is refunded on its own

Status: accepted
Date: 2026-10-01

## Context

A refund by amount did not say what it returned. While tips belong to
employees a sale reports no tip, yet a tip returned as an amount was
reversed in EET like goods, because the reversal cap knew only totals. No
rule about what an amount returns first can tell a tip from goods: goods
first is that error, and tip first shrinks the storno of a returned item by
the tip.

## Decision

A refund by amount or by items returns goods only, so its limit and its
prefilled amount leave out the payment's tip. The tip is refunded by its own
action: the whole tip, once per payment, in cash or outside Payky, whoever
it belongs to. The partly or fully refunded state counts goods only, and the
refund list labels a tip refund as the tip.

## Alternatives considered

A "part of it is the tip" field on every refund by amount, which every
refund of a tipped payment would carry and a field left at its default would
repeat the error. Offering the tip refund only for a tip that belongs to the
business, which would record a card terminal's refund of the whole charge
short by the employees' tip.

## Consequences

Returning everything takes two confirmations, the goods and then the tip.
While goods remain, staff can still enter the tip's amount as goods, which
is reversed as goods. The separate action and a note in the refund dialog
are what steer them to the tip refund. How a tip refund reaches EET is
eet/0011.

## Enforced by

- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > leave the tip out of a refund by amount`
- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > leave the tip out of the cash received`
- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > return the whole tip once, in cash from the cash register`
- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > return the tip after all the goods`
- `src/core/modules/refund/refund-actions.test.ts > refunds of a payment with a tip > refuse a tip refund without a tip or before the payment is paid`
- `src/core/modules/refund/refund-utils.test.ts > deriveRefundableTipAmount > offers the whole tip until a tip refund returns it`
- `src/core/modules/refund/refund-utils.test.ts > summarizeRefundsByPayment > leaves a tip refund out of the refunded state`
