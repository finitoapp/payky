# 0009 The device that took the money reports the sale, and others take over after 10 minutes

Status: accepted
Date: 2026-09-29

## Context

EET wants a sale recorded at the latest when the money is received (GFŘ
seminar for developers, slide 17), with the identifier of the cash register
on which it is recorded (slides 19 and 22). EET treats a message with the
same body as the same sale, and the body includes that identifier (interface
description, chapter 4).

## Decision

A sale belongs to the device that recorded the payment's first settlement:
where staff confirmed cash or card, or matched a transfer by hand. A
settlement Payky matched on its own belongs to the device that created the
payment. A reversal belongs to the device that recorded the refund. For 10
minutes only that device creates the record and sends it automatically.
After that, any device of the account creates a missing record and delivers
an unconfirmed one, still with the recording device's cash register
identifier.

## Alternatives considered

Only the creating device ever sending, which left a lost device's sales
unreported. Any device sending at any time, which lets two devices both
claim the first sending. A lease renewed with each attempt, which would have
to outlast the 15-minute backoff and delay the takeover it exists for.

## Consequences

Several devices may take over at once. Each sends the same body marked as a
repeat, so EET sees one sale. Retry on another device waits the same 10
minutes unless the record already has an attempt.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: takeover > reports a payment on the device that settled it in cash`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: sale records > reports a bank payment on the device that confirmed it by hand`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: takeover > takes over a pending sale once its device's priority is over`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: takeover > creates a sale its recording device never created`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: takeover > takes over a reversal only after its sale's confirmation and the priority`
- `src/core/modules/eet/eet-utils.test.ts > getEetRecordingDeviceWaitEndsAt > keeps another device waiting for 10 minutes unless an attempt exists`
- `e2e/eet.spec.ts > another device's sale waits for that device, then is sent from here as a repeat`
