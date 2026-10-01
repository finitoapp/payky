# 0001 A sale is a payment, not a bill

Status: accepted
Date: 2026-09-27

## Context

EET records money at the latest when it is received (GFŘ seminar for
developers, slide 17). A deposit and the rest are recorded like any other
payments, with no link between them (slide 61). A bill can be paid in
several payments, and a keypad payment has no bill at all.

## Decision

A payment whose first settlement comes while EET is on gets its own EET
sale, and later money beyond it gets extra money sales (see eet/0006).
`docs/eet.md` lists the payments that are never reported despite this, such
as a payment with no device, or one whose sale was not yet created when EET
was switched off and on again. A bill paid in two payments has two sales. A
sale carries the bill id only for display.

## Alternatives considered

One sale per closed bill, as the original issue worded it. It would report a
split bill late and a keypad sale never.

## Consequences

The bill detail shows the EET status of each of its payments. A refund
reverses a payment's sales, not a bill's.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: sale records > reports each payment of a bill paid in two payments`
- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: sale records > reports a keypad Lightning payment without a bill`
