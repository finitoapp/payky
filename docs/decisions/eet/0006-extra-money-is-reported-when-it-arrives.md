# 0006 Extra money is reported as its own sale when it arrives

Status: accepted
Date: 2026-09-29

## Context

A payment can bring more than its first settlement: a second settlement, a
transfer larger than the payment, or the rest of a split. A sale must be
recorded at the latest when its money is received (GFŘ seminar for
developers, slide 17). Payky therefore treats money the business keeps as a
sale when it arrives, and reverses money it returns.

## Decision

A payment's sale reports what its first settlement brought, capped at the
payment amount, or for cash the cash received (see payment/0001), less a tip
that belongs to employees (see eet/0005). Everything later settlements bring
beyond that is reported as an extra money sale when it arrives, with the
method, time and recording device of the claim that brought it. Each
increase adds one more extra money sale. Extra money brought before EET was
enabled is never reported.

## Alternatives considered

Holding the extra money back until staff decides whether it was a mistake.
That is lawful only if a mistaken payment is not a sale, which nothing we
hold confirms. Reporting on arrival and reversing on return is lawful either
way. Keying each extra money sale by the settlement that brought it. A
device that missed a settlement in the middle would leave it unreported for
good, while keying by the level already reported lets the next level report
the rest once the settlement syncs.

## Consequences

Returning a duplicate reverses only the extra money and leaves the real sale
reported. A first settlement that paid only part reports only that part, and
the rest is reported only if it ever arrives.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports a payment settled twice as its sale and an extra sale`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports only what a short first settlement brought`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports each increase of the extra money once`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > never reports extra money brought while EET was disabled`
- `e2e/eet.spec.ts > a payment settled twice reports the extra money, and refunding it reverses only that`
