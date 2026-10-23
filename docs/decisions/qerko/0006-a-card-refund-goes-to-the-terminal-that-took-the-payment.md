# 0006 A card refund goes to the terminal that took the payment

Status: accepted
Date: 2026-10-23

## Context

Every device chooses its own terminal (qerko/0001) and can change it at any
time. Qerko takes a refund on the terminal that took the card payment, so
asking another one cannot return that money.

## Decision

A Qerko payment keeps the id of the terminal it was sent to
(`paymentQerkoTerminal.terminalId`; a retry replaces it with the terminal of
the attempt that went through). A refund to the card is always started on that
terminal: `startQerkoTerminalRefund` takes no terminal and reads it from the
payment, so choosing another terminal on a device afterwards, or having none
chosen, changes nothing. A payment with no terminal on record, like one
without a refund id, cannot be refunded to the card.

## Alternatives considered

Using the terminal the refunding device has chosen. It refunds on the wrong
terminal after a change, and offers no card refund on a device that has none.

## Consequences

The refund screens do not read the device's terminal choice. The terminal the
payment used must stay activated in Qerko for its refund to succeed.

## Enforced by

- `packages/core/src/modules/refund/refund-qerko-actions.test.ts > refund to the card through Qerko > the refund goes to the terminal that took the payment and needs one on record`
