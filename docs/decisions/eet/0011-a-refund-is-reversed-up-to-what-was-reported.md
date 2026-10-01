# 0011 A refund is reversed in EET as a negative sale of what was reported

Status: accepted
Date: 2026-10-01

## Context

EET 2.0 has no storno message. A storno is a message with a negative amount,
sent with the current time and a new message identifier, and it cannot be
linked to the original sale (GFŘ seminar for developers, slides 17 and 58).
A tip that belongs to employees is not part of the reported sale (see
eet/0005).

## Decision

A refund of a payment with a supported sale becomes one reversal, sent as a
negative sale at the moment of the refund. A refund of goods reverses its
amount. A tip refund (see refund/0004) reverses the tip the payment's sale
reports, which the sale fixes when it is created: the whole tip while tips
belong to the business, nothing while they belong to employees, and nothing
for a sale created before it recorded this. Both are capped at what the
payment's sales reported minus earlier reversals, so a refund with nothing
to reverse, such as the tip refund of a tip that belonged to employees, gets
no reversal. A reversal waits until every sale of its payment is confirmed,
because one sent first could take EET below what it holds if a sale were
later rejected.

## Alternatives considered

Blocking the refund until the sale is confirmed. A refund is a real money
event staff must record when it happens, even while EET is down. Reading a
sale without a recorded tip as reporting the whole tip. A tip refund of such
a sale created while tips belonged to employees would send a storno and take
EET below what was sold.

## Consequences

A tip that belongs to employees is never reversed when it is refunded as the
tip; entered as an amount it is a refund of goods (see refund/0004). The tip
refund of a sale created before the reported tip was recorded sends no
storno, so a tip that sale did report stays in EET, which errs toward
reporting more than was sold. A reversal waits for good if a sale of its
payment is never confirmed. A reversal created while EET is off, or in
another environment or for another taxpayer than its sale, is never sent and
is listed as needing attention.

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses $name`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > caps a refund at a sale that left out an employees' tip`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > caps later refunds at what the sale has left`
- `src/core/modules/eet/eet-actions.test.ts > deliverEetReversal > sends the negative amount at the moment of the refund`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: reversals > sends a reversal only once its sale is confirmed`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: reversals of extra money > returning the duplicate leaves the real sale reported`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > fixes the tip it reports`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses no tip refund of a tip that belonged to employees`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses the tip refund of a tip that belonged to the business`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses no tip refund of a sale that recorded no reported tip`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports no tip on an extra sale`
- `e2e/eet.spec.ts > a refunded tip reaches EET only while tips belong to the business`
