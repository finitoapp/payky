# 0010 Station sales are not reported to EET

Status: accepted
Date: 2026-10-07

## Context

An EET sale is reported by the device that settles it, with that device's
premises and register. A station's payments reach the owner only as
reports, and the owner device never took them.

## Decision

The owner's EET reporting leaves out every payment with a station. Stations
run no EET reporting.

## Alternatives considered

Reporting station sales from the owner: it would report them under the
wrong register and late.

## Consequences

A merchant who must report EET cannot take those sales on a station.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: sale records > does not report a payment taken at a station`
- `src/core/background-jobs/background-jobs.test.ts > stationBackgroundJobs > settles nothing at a station: no FIO, Spark sync or EET`
