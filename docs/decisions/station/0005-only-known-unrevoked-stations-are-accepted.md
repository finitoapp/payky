# 0005 Only known, non-revoked stations are accepted, only about their own payments

Status: accepted
Date: 2026-10-07

## Context

Anyone can address a gift wrap to the owner's comms key. A station link can
leak, and a station device can be lost.

## Decision

The owner takes reports only from a key that is one of its stations and not
revoked, and only about that station: a report naming another station, or a
payment the owner or another station owns, is stored at most and never
written into the owner's payments. Revoking a station is final. The owner
tells a revoked station so, and the station leaves its account and logs out.

## Alternatives considered

Un-revoking. A revoked link may be in someone else's hands; a new station is
a new link.

## Consequences

Reports a revoked station had not delivered are lost to the owner. The
revoke confirmation warns about them.

## Enforced by

- `src/core/background-jobs/jobs/owner-station-job.test.ts > owner station job > ignores reports from a key that is no station of its`
- `src/core/background-jobs/jobs/owner-station-job.test.ts > owner station job > takes nothing from a revoked station and tells it it is revoked`
- `src/core/modules/station/station-report-actions.test.ts > receiveStationReports > drops a report about another station`
- `src/core/modules/station/station-report-actions.test.ts > receiveStationReports > stores but never projects onto the owner's own payment`
- `src/core/background-jobs/jobs/station-comms-job.test.ts > station comms job > leaves the station account when revoked`
