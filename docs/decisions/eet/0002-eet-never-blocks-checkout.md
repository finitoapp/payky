# 0002 EET never blocks checkout or changes whether a payment is paid

Status: accepted
Date: 2026-09-27

## Context

EET can be slow, unreachable, or reject a sale because of a configuration
mistake. The money has been received either way.

## Decision

Delivery runs in the background. The paid screen, the payment status and
bill closing never wait for EET and never change because of it. A payment
whose sale EET has not confirmed stays paid, and its sale shows as pending
or rejected.

## Alternatives considered

None recorded.

## Consequences

Staff learn about EET trouble from the sale's status, the overdue flag and
the list of unconfirmed sales in the EET settings, not at checkout.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: delivery > leaves a payment paid and its bill closed when EET rejects the sale`
- `e2e/eet.spec.ts > the paid screen appears at once while EET cannot be reached`
