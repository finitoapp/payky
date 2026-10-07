# 0009 One shared employee list, no PIN, every payment tagged with station and employee

Status: accepted
Date: 2026-10-07

## Context

The owner wants to know which station and which employee took each payment.
Stations are shared counters where staff switch often.

## Decision

The owner keeps one employee list, sent to every station in its config with
the same ids. At a station anyone picks who is taking payments, with no PIN.
Every station payment carries its station and employee, and the owner's copy
keeps both, plus when the station took it.

## Alternatives considered

A PIN per employee: slower at the counter, and it proves little on a shared
device. A list per station: the same people work at several.

## Consequences

The employee tag is a statement, not proof. A removed employee's payments
keep the tag.

## Enforced by

- `src/core/modules/station/station-outbox-actions.test.ts > syncStationOutbox > tags every report with the station and the employee who took it`
- `src/core/modules/station/station-report-actions.test.ts > receiveStationReports > stores each report, acks it and projects the payment for the station and employee`
- `src/core/modules/station/station-config-actions.test.ts > applyStationConfig > sets the station up on the owner's accounts, employees and settings`
