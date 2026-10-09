# 0006 A withdrawal to this wallet itself is refused

Status: accepted
Date: 2026-10-09

## Context

Paying one of our own invoices, or an invoice whose Spark fallback is
this wallet, moves nothing but a fee and confuses the books.

## Decision

The quote refuses (`SelfWithdrawal`) an invoice whose Spark fallback
identity is this wallet's identity public key, and an invoice recorded on
one of our own payments. The fallback is read the way the SDK reads it:
the `fallback_address` field first, then the Spark route hint.

## Alternatives considered

None recorded.

## Consequences

An invoice of ours that never reached this device yet is not recognized.

## Enforced by

- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses an invoice whose Spark fallback is this wallet`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses one of our own payment invoices`
- `src/core/modules/withdraw/withdraw-destination-utils.test.ts > parseWithdrawDestination > reads the Spark identity from a Spark invoice fallback, as Payky's own invoices carry it`
- `src/core/modules/withdraw/withdraw-destination-utils.test.ts > parseWithdrawDestination > reads the Spark identity from a Spark route hint`
