# 0005 A background job verifies Lightning address payments nobody is watching

Status: accepted
Date: 2026-10-25

## Context

The wait screen polls verify only while it is open. A customer may pay after
staff closed it, after a restart, or while another device shows the payment,
and the wallet tells nobody: Payky has to ask, as with a Qerko terminal
(qerko/0005).

## Decision

- A job watches every Lightning address invoice not yet proved paid, on a
  payment not deleted and not claimed another way, on browser and native
  devices alike (the wallets allow cross-origin calls). It polls verify
  with a backoff from two seconds up to a minute, and at once when the
  device comes back online.
- It drops an invoice a day after the invoice expired; a wallet that has not
  settled it by then will not.
- The wait screen polls every two seconds besides. Both run the same
  idempotent settlement (lightning-address/0002), so several devices and the
  screen may poll at once.

## Alternatives considered

Polling only on the wait screen: a payment made after it closed would stay
unpaid, though the money arrived.

## Consequences

A demo account runs no jobs (demo-data/0001); its payments settle as the
generator writes them.

## Enforced by

- `packages/core/src/background-jobs/jobs/lightning-address-verify-job.test.ts > lightning address verify job > settles a payment nobody is watching once the wallet proves it paid`
- `packages/core/src/background-jobs/jobs/lightning-address-verify-job.test.ts > lightning address verify job > keeps polling a wallet that says paid without a preimage`
- `packages/core/src/background-jobs/jobs/lightning-address-verify-job.test.ts > lightning address verify job > polls at once when the device comes back online`
- `packages/core/src/background-jobs/jobs/lightning-address-verify-job.test.ts > lightning address verify job > gives up a day after the invoice expired`
- `apps/web-app/e2e/payment-lightning-address.spec.ts > a payment made after the screen closed is settled in the background`
