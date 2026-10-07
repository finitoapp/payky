# 0012 Cash and a hand-confirmed bank transfer settle on the owner from the report; Lightning only from the owner's own sync

Status: accepted
Date: 2026-10-07

## Context

Supersedes station/0006, which kept bank transfers off the report: only the
owner's FIO sync or the owner confirming by hand settled them. A customer
paying by bank transfer at the counter then stayed pending on the station
until the owner was online, and staff who could see the transfer arrive (a
banking app, the customer's confirmation) had no way to close the sale.
The owner already settles its own bank transfers by hand the same way
(`markPaymentPaidIban`). Lightning money arrives in the owner's wallet,
which the owner's Spark sync reads directly.

## Decision

A cash settlement and a bank-transfer settlement in a report are recorded
on the owner exactly as the owner's own confirmation records them: one
`manual` account transaction on the reported owner account, at the time the
station gave, claimed against the payment. A bank settlement is skipped
when the owner already holds a claim for the payment, from its FIO sync or
an earlier report, so reporting the payment again never adds money. A
Lightning settlement in a report is still not recorded: the owner's Spark
sync settles it. When the owner holds bank or Lightning money for a station
payment the station has not reported paid, it tells the station, which
records it under the same id its own confirmation uses and reports the
payment again.

## Alternatives considered

Keeping bank settlement with the owner (station/0006): it leaves counter
sales pending for as long as the owner is away. Trusting Lightning reports
too: the owner's wallet already says whether the money is there, so a
report could only be worse.

## Consequences

A station can mark a bank payment paid that never arrived, as the owner can
on its own device. When the FIO sync later finds the real transfer for a
payment already confirmed by hand, on the station or by the owner, the
transfer is recorded on the account but claimed by nothing, so the payment
is counted once. The overview flags a payment the station reported paid
only while the owner holds no claim for it, which now means Lightning not
yet seen by the owner's sync, or a report naming an account the owner does
not have.

## Enforced by

- `src/core/modules/station/station-report-actions.test.ts > projectStationReport > settles cash and a hand-confirmed bank transfer from the report, but Lightning only from the owner's own sync`
- `src/core/modules/station/station-report-actions.test.ts > projectStationReport > records a reported bank transfer once, however often it is reported`
- `src/core/modules/station/station-report-actions.test.ts > projectStationReport > adds nothing to a bank transfer the owner's bank sync already settled`
- `src/core/modules/station/station-report-actions.test.ts > projectStationReport > leaves the transfer the bank sync finds later unclaimed, as after the owner's own confirmation`
- `src/core/modules/station/station-config-actions.test.ts > applyStationSettlement > keeps a bank transfer the station confirmed by hand settled once`
- `src/core/background-jobs/jobs/station-comms-job.test.ts > station comms job > runs on the owner's config and reports a paid payment until it is acknowledged`
