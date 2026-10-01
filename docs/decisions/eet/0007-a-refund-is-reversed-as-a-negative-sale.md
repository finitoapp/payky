# 0007 A refund is reversed in EET as a new negative sale, capped at what was reported

Status: superseded by eet/0011
Date: 2026-09-29

## Context

EET 2.0 has no storno message. A storno is a message with a negative amount,
sent with the current time and a new message identifier, and it cannot be
linked to the original sale (GFŘ seminar for developers, slides 17 and 58).

## Decision

A refund of a payment with a supported sale becomes one reversal, sent as
the negative of its amount at the moment of the refund. The amount is capped
at what the payment's sales reported minus earlier reversals, so once
everything reported has been reversed, a further refund gets no reversal. A
reversal waits until every sale of its payment is confirmed, because one
sent first could take EET below what it holds if a sale were later rejected.

## Alternatives considered

Blocking the refund until the sale is confirmed. A refund is a real money
event staff must record when it happens, even while EET is down.

## Consequences

Refunding a whole payment does not reverse its employees' tip, but a refund
of the tip alone is reversed, as the cap does not know what a refund returns
(see eet/0005). A reversal waits for good if a sale of its payment is never
confirmed. A reversal created while EET is off, or in another environment or
for another taxpayer than its sale, is never sent and is listed as needing
attention.

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses $name`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > leaves out a refunded tip that belongs to employees`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > caps later refunds at what the sale has left`
- `src/core/modules/eet/eet-actions.test.ts > deliverEetReversal > sends the negative amount at the moment of the refund`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: reversals > sends a reversal only once its sale is confirmed`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: reversals of extra money > returning the duplicate leaves the real sale reported`
