# 0003 An unknown terminal result needs a confirmed retry

Status: accepted
Date: 2026-10-23

## Context

Like SwitchioPay (payment/0006), a Qerko terminal can leave Payky without an
answer: the payment status can be `unknown`, starting it can time out
upstream, and the connection can drop after the request left. In each case
the card may have been charged.

## Decision

An attempt is stored as pending before the request leaves, so a dropped
connection leaves something to ask Qerko about. A status of `unknown`, or an
upstream timeout when starting, moves the attempt to unresolved: another
attempt needs the caller to confirm that staff checked the terminal. A
refusal to start (busy, not connected, ...) clears the attempt, since no card
was asked. A pending attempt Qerko has never heard of ends without money, but
only after a grace period, because another device may poll it before the
starting device's request has landed.

## Alternatives considered

Treating `unknown` as a decline, which risks charging the customer twice
(payment/0006). Ending an unknown attempt at once, which orphans a live
terminal payment when another device polls first.

## Consequences

The payment screen asks for the confirmation before the retry, on web and
native alike. A pending attempt blocks another one on the same payment.

## Enforced by

- `packages/core/src/modules/payment/payment-qerko-actions.test.ts > qerko terminal payment > an unknown result is unresolved and needs a confirmed retry`
- `packages/core/src/modules/payment/payment-qerko-actions.test.ts > qerko terminal payment > a dropped connection leaves the attempt pending, and a poll that finds nothing ends it without money`
- `packages/core/src/modules/payment/payment-qerko-actions.test.ts > qerko terminal payment > a refusal to start (%s) clears the attempt, unless it may have reached the terminal`
- `apps/web-app/e2e/qerko-terminal.spec.ts > an unknown result asks staff to check before paying again`
