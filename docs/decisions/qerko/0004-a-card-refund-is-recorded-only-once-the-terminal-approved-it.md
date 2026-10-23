# 0004 A card refund is recorded only once the terminal approved it

Status: accepted
Date: 2026-10-23

## Context

Refunding to the card goes through the terminal, which can decline, be
cancelled on, or answer nothing. Recording the refund first would show money
returned that never moved, and every figure built on refunds (the refundable
rest, sales statistics, EET reversals) would be wrong.

## Decision

A refund to the card starts as a `qerkoTerminalRefundAttempt`. The `refund`
row, its goods lines and the negative account transaction on the Qerko
account are written together when the terminal approves, under ids derived
from the attempt's. A declined attempt is kept to be shown; an unknown one
blocks another refund of the payment until staff dismiss it after checking.
Only a payment taken through Qerko, with the refund id its receipt carried,
can be refunded to the card; `refundPayment` does not accept the terminal
method.

## Alternatives considered

Writing the refund at once and reversing it on a decline, which exposes the
wrong figures meanwhile and a reversal that can itself fail.

## Consequences

Queries over refunds need no change. The checks on what may be refunded are
the ones `refundPayment` and `refundPaymentTip` make.

## Enforced by

- `packages/core/src/modules/refund/refund-qerko-actions.test.ts > refund to the card through Qerko > records the refund and the money going out once the terminal approves`
- `packages/core/src/modules/refund/refund-qerko-actions.test.ts > refund to the card through Qerko > a declined refund is kept to be shown and does not block another try`
- `packages/core/src/modules/refund/refund-qerko-actions.test.ts > refund to the card through Qerko > an unknown result blocks another refund until staff dismiss it`
- `packages/core/src/modules/refund/refund-qerko-actions.test.ts > refund to the card through Qerko > a payment that was not taken through Qerko cannot be refunded to the card`
- `apps/web-app/e2e/qerko-terminal.spec.ts > refund a card payment back to the card through the terminal`
