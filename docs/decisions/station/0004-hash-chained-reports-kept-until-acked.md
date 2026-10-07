# 0004 Append-only, hash-chained reports are kept until acked

Status: accepted
Date: 2026-10-07

## Context

The owner must learn every payment a station took and every change to it,
over relays that may drop events, while the station may be offline for
hours. A station that loses or rewrites a report must not go unnoticed.

## Decision

Whenever a payment's snapshot changes, the station appends a report to its
outbox with the next seq, the previous report's hash and the payload, hashed
together. It sends unacknowledged reports on every change, every minute and
when back online, resending one a relay took after five minutes without an
ack. The owner stores every report whose hash holds, acks it by seq and hash,
and shows gaps, broken links and seqs received twice with different content.

## Alternatives considered

Sending each change once and trusting the relays. A lost event would lose a
payment silently.

## Consequences

The outbox and the owner's report table grow forever. A station only reports
payments taken in the last week again on its own; an older one is reported
again when the owner settles it (station/0006).

## Enforced by

- `src/core/modules/station/station-outbox-actions.test.ts > syncStationOutbox > appends a chained report only when a payment changed`
- `src/core/modules/station/station-outbox-actions.test.ts > markStationReportsAcked > ignores an ack for a report it did not send`
- `src/core/modules/station/station-report-actions.test.ts > receiveStationReports > drops a report whose hash does not hold, unacked`
- `src/core/modules/station/station-report-utils.test.ts > analyzeStationReportChain > finds gaps, the trailing one from the seq the station said it has`
- `src/core/modules/station/station-report-utils.test.ts > analyzeStationReportChain > finds a report that does not link to the one before it`
- `src/core/modules/station/station-report-utils.test.ts > analyzeStationReportChain > finds a seq sent twice with different content`
- `src/core/background-jobs/jobs/station-comms-job.test.ts > station comms job > resends unacknowledged reports`
