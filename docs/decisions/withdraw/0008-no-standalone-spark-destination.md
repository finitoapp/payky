# 0008 A standalone Spark destination is not supported

Status: accepted
Date: 2026-10-09

## Context

The SDK's public `fulfillSparkInvoice` takes no `transferId`, so neither
the transfer's nor the account transaction's id would be known before
sending. Wallets offering a Spark invoice but no Lightning invoice are
rare.

## Decision

`spark1…` (a bare address or a Spark invoice, with or without `spark:`)
is recognized and refused: "Ask the recipient for a Lightning invoice or a
Lightning address". Money for a Spark wallet goes as a Lightning invoice
with a Spark fallback, which `preferSpark` pays over Spark, without a fee
and with the transfer id known up front.

## Alternatives considered

Paying a Spark invoice through `fulfillSparkInvoice`: the withdrawal would
need its link to the movement filled in after sending, queries on the
invoice's state and its own crash recovery. It can come later as another
detail table.

## Consequences

None beyond the message.

## Enforced by

- `src/core/modules/withdraw/withdraw-destination-utils.test.ts > parseWithdrawDestination > refuses a Spark destination %#`
