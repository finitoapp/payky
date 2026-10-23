# 0005 A background job settles what nobody is watching

Status: accepted
Date: 2026-10-23

## Context

A Qerko payment or refund is driven by Qerko, not by the screen that started
it. The screen may be closed, the browser killed or the device offline while
the card is charged; leaving the answer unread would leave the money
unclaimed.

## Decision

A background job polls every pending attempt (payments and card refunds) on
whichever device is open, first after a second and then at doubling
intervals up to a minute, or at once when the device comes back online. It
runs in the browser as well as the native app, since Qerko allows
cross-origin calls. Every write is idempotent (derived ids, comparisons on
the attempt's own marker), so the job runs beside the payment screen's own
polling and on several devices at once.

## Alternatives considered

Polling only from the payment screen, which loses a payment when the screen
is left. Polling only on the starting device, which loses it when that device
is gone.

## Consequences

The failure reason of a payment is kept on its row, because the job may be
the one that reads it. A demo account runs no jobs.

## Enforced by

- `packages/core/src/background-jobs/jobs/qerko-terminal-sync-job.test.ts > qerko terminal sync job > settles a payment nobody is watching once Qerko approves it`
- `packages/core/src/background-jobs/jobs/qerko-terminal-sync-job.test.ts > qerko terminal sync job > settles a refund to the card the terminal approves later`
- `packages/core/src/background-jobs/jobs/qerko-terminal-sync-job.test.ts > qerko terminal sync job > polls at once when the device comes back online`
- `apps/web-app/e2e/qerko-terminal.spec.ts > pay on the terminal: a declined card says so and the payment can be tried again`
