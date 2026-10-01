# 0010 The first-sending mark errs toward repeated

Status: accepted
Date: 2026-09-29

## Context

`prvni_zaslani` says whether a message is the first attempt to send its
sale, and after an attempt without a POK every later message is a repeat
(GFŘ seminar for developers, slide 57). No device can know that an attempt
never reached EET before its answer arrives, so no rule makes the mark right
in every case.

## Decision

A message is marked as the first sending only when it is the first attempt
anyone made for the record, by its recording device, and starts within 5
minutes of the record's start time. Every other message is a repeat. An
attempt is written before its message leaves, so one cut off by the app
closing counts as made and as possibly recorded by EET.

## Alternatives considered

Deciding from the answer, which sent a cut-off attempt's successor as the
first again. Waiting until an attempt reached the relay before sending,
which would block the first sending whenever the relay is down.

## Consequences

The mark errs toward repeated: a first sending later than 5 minutes is
marked as a repeat. It errs toward first only when a device clock is more
than 5 minutes ahead of the recording device's. The 5 minutes between the
last first sending and the earliest takeover absorb clocks that disagree and
requests still in flight.

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > first and repeated sending > marks the recording device's first attempt as the first sending`
- `src/core/modules/eet/eet-actions.test.ts > first and repeated sending > marks the attempt after an app closed mid-attempt as repeated`
- `src/core/modules/eet/eet-actions.test.ts > first and repeated sending > marks a first attempt made after 5 minutes as repeated`
- `src/core/modules/eet/eet-actions.test.ts > first and repeated sending > marks an attempt from another device as repeated`
- `src/core/modules/eet/eet-actions.test.ts > retryEetSale > keeps the original data after an attempt cut off by the app closing`
- `src/core/modules/eet/eet-utils.test.ts > isEetFirstSending > is %s: %s`
- `src/core/modules/eet/eet-utils.test.ts > isEetFirstSending > errs toward first after a takeover by a clock %i minutes ahead: %s`
