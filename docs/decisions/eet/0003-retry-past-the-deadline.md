# 0003 Unconfirmed sales are retried past the 48-hour deadline

Status: accepted
Date: 2026-09-27

## Context

After a failed attempt, a sale has to be sent again as soon as the outage
ends, at the latest within 48 hours, and the duty to send lasts after that
too (GFŘ seminar for developers, slide 57).

## Decision

A sale that got no answer or a temporary EET error is retried automatically,
with a delay that doubles from 30 seconds up to 15 minutes, with no attempt
limit and no stop at 48 hours. A rejected sale is not retried automatically.
A pending or rejected sale is flagged overdue 48 hours after its time of
sale.

## Alternatives considered

None recorded.

## Consequences

A sale that can never succeed, such as one for a build without a production
endpoint, retries forever. `docs/eet.md` lists that as a known gap.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > getEetRetryDelayMs > starts at 30 seconds, doubles, and stops at 15 minutes`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: delivery > keeps retrying past the 48-hour deadline`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: delivery > rejects $errorType without retrying`
- `src/core/modules/eet/eet-utils.test.ts > isEetSaleOverdue > flags a pending sale 49 hours after the time of sale`
- `src/core/modules/eet/eet-utils.test.ts > isEetSaleOverdue > flags a rejected sale and never a confirmed one`
