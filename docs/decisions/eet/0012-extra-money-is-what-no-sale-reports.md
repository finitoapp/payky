# 0012 Extra money is what the payment's sales do not report, less a tip that belongs to employees

Status: accepted
Date: 2026-10-02

## Context

A payment can bring more than its first settlement: a second settlement, a
transfer larger than the payment, or the rest of a split. A sale must be
recorded at the latest when its money is received, or when the order to pay
is issued if that comes first (GFŘ seminar for developers, slide 17). Two
devices cut off from sync can each take money for the same payment, and the
device that took the money reports it (see eet/0009). A tip that belongs to
employees is not a reported sale (see eet/0005).

## Decision

A payment's sale reports one settlement: the first one the device creating
it sees, capped at the payment amount, or for cash the cash received (see
payment/0001), less a tip that belongs to employees. The sale is keyed by
the payment and that settlement, so two devices that settle one payment
while cut off from sync create one sale each. A device that takes over
creates the same sale as the recording device. Everything the payment's
claims bring beyond the settlements its sales report is reported as an
extra money sale when it arrives, with the method, time and recording
device of the payment's latest claim. While tips belong to employees and
the settlements the sales report bring less than the tip, extra money
starts above the tip. Each
increase adds one more extra money sale. Extra money brought before EET was
enabled is never reported.

## Alternatives considered

One sale per payment, keyed by the payment alone, as eet/0006 had it. Two
devices cut off from sync then wrote one row between them and each sent its
own settlement, and the second settlement was reported again as extra money.
Taking a tip that belongs to employees off the payment's sale alone. A first
settlement smaller than the tip then reported `0.00`, and the rest of the
tip was reported with the extra money. Holding the extra money back until
staff decides whether it was a mistake. It would leave the money unreported
if it was a sale, and no source we hold says a mistaken payment is not one.
Reporting on arrival and reversing on return is safe either way: recording
the return of a payment that was not a sale is not challenged (GFŘ guideline
on the EET act, version 1.0 of 31 August 2016, section 2.2.3, written for
the first EET). Keying each extra money sale by the settlement that brought
it. A device that missed a settlement in the middle would leave it
unreported for good, while keying by the level already reported lets the
next level report the rest once the settlement syncs.

## Consequences

Returning a duplicate reverses only the extra money and leaves the real sale
reported. A first settlement that paid only part reports only that part, and
the rest is reported only if it ever arrives. A payment can have two sales,
and a refund's reversal is capped at what all of them report (see eet/0011).
A device that receives the other device's settlement before that device's
sale reports the settlement again as extra money. `docs/eet.md` lists that
as a known gap.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: sale records > creates one record when two devices see the same payment`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports a payment settled twice as its sale and an extra sale`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports only what a short first settlement brought`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports the part of one transfer above the payment`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > leaves automatically matched extra money to the device that created the payment`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports extra money on the device that matched it by hand`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports each increase of the extra money once`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > never reports extra money brought while EET was disabled`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > reports a payment two devices settled while cut off from sync as one sale each`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: extra money > leaves the rest of an employees' tip out of the extra money`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > freezes the sale data of a payment`
- `src/core/modules/eet/eet-utils.test.ts > createEetSaleId > derives the same id for the same settlement of a payment on every device`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > reports a second settlement from the settlement that brought it`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > breaks a tie on the settlement time by claim id`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > counts every settlement a sale of the payment reports`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > reports the first settlement when only a later one has a sale`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > lets a sale of a removed claim stand for the earliest settlement without a sale`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > lets a sale that recorded no settlement stand for the first one`
- `src/core/modules/eet/eet-utils.test.ts > deriveDueEetExtraSale > leaves out the part of an employees' tip the first settlement could not cover`
- `e2e/eet.spec.ts > a payment settled twice reports the extra money, and refunding it reverses only that`
