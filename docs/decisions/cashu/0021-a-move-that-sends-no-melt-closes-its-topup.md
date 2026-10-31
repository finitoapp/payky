# 0021 A move that sends no melt closes its topup

Status: accepted
Date: 2026-10-28

## Context

A move (cashu/0015) writes its topup at the target before the melt at the
source. Only a melt the source answered UNPAID closed that topup `failed`
(cashu/0014), and a move closed it itself only when the source lacked the
funds. Every other failure before a melt was sent — the source unreachable
or refusing at the quote check, an expired quote, a counter lock timeout,
a pre-swap the source refused (closed `failed` since cashu/0019) — left the
topup `pending`. A sweep retry left one more each time. The Cashu job polled
a move's topup for a day and then left it alone, so such a topup stayed
`pending` for good, although the mint's UNPAID past expiry would have
closed it (finding 9 of the PR #172 review).

## Decision

- A move whose melt was never written, and so never sent, closes its topup
  `failed` at once, in a batch of its own: no money can reach the target's
  invoice.
- A melt the source closes without paying, `unpaid` or `failed`, closes the
  move's topup `failed` in the batch that closes the melt.
- A melt that may have been sent — its response lost, still `pending` — and
  a quote the source reports pending or paid leave the topup `pending`; the
  job resumes the melt and claims the topup (cashu/0027).
- The Cashu job polls a move's topup like a payment's, with no window: it is
  claimed once paid, or closed `failed` when the mint answers UNPAID past
  its expiry and a grace (`cashu/0029`).

## Alternatives considered

- Closing the topup on every move error: a lost melt response may still pay
  the invoice, and the claimed money would be stranded.
- Keeping the day window and closing what falls out of it: the age of a
  topup says nothing about whether its invoice was paid; only the mint does.

## Consequences

A move topup whose mint never answers again is polled every five minutes,
as a payment's is.

## Enforced by

- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a move that fails before its melt is written closes the move's topup`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a pre-swap the source refuses closes the melt and the move's topup together`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a melt that may have been sent leaves the move's topup pending until it recovers`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > closes a move's topup left unpaid past its expiry, however old it is`
