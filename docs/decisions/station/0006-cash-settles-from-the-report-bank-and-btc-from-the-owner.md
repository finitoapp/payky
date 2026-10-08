# 0006 Cash settles on the owner from the report; bank and Lightning only from the owner's own sync

Status: superseded by station/0012
Date: 2026-10-07

## Context

Cash goes into the station's drawer, which only staff see. Bank transfers
and Lightning payments arrive on the owner's own accounts, which the owner
can check itself.

## Decision

A cash settlement in a report is recorded on the owner as received into its
cash register. A bank or Lightning settlement in a report is not: the
owner's FIO sync, the owner confirming the transfer by hand, or its Spark
sync settles those. When the owner holds bank or Lightning money for a
station payment the station has not reported paid, it tells the station,
which records it and reports the payment again.

## Alternatives considered

Trusting every settlement a station reports. A compromised station could
mark unpaid payments paid.

## Consequences

A station's bank payment stays pending until the owner's bank sync or the
owner confirms it. The overview counts payments a station reported paid that
the owner has no money for.

## Enforced by

- `src/core/modules/station/station-report-actions.test.ts > projectStationReport > settles cash from the report, but bank and Lightning only from the owner's own sync`
- `src/core/background-jobs/jobs/station-comms-job.test.ts > station comms job > runs on the owner's config and reports a paid payment until it is acknowledged`
