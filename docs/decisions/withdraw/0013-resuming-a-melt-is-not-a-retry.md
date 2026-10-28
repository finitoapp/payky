# 0013 Resuming a pending melt settles it; it is not a retry

Status: accepted
Date: 2026-10-14

## Context

withdraw/0007 says a withdrawal is never retried. A melt whose response was
lost may already have paid the invoice; its inputs stay `held` under a
`pending` melt (`cashu.md` §6).

## Decision

- A melt whose answer did not arrive stays `pending`, and so does its
  withdrawal. The Cashu job resumes the melts this device sent: it asks the
  mint about the quote and, on `PAID`, reclaims the change over the recorded
  blank outputs and writes the withdrawal's movement; on `UNPAID` returns the
  inputs and marks the withdrawal failed. It never sends the melt again.
- Linky may resume the same melt; both settle from the mint's answer.

## Alternatives considered

Treating a lost response as failed: the invoice may be paid, and a new
withdrawal could pay it twice.

## Consequences

A withdrawal can show as in progress until the mint answers.

## Enforced by

- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a lost response stays in progress until the resume settles it; it is never sent again`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a melt the mint does not pay marks the withdrawal failed`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a lost response is settled by the resume, never sent again`
