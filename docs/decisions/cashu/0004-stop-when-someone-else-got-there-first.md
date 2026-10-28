# 0004 Payky stops when someone else claimed first

Status: superseded by cashu/0015
Date: 2026-10-14

## Context

Linky resumes every pending operation it syncs, Payky's topups included, and
its locks do not exclude Payky or another device (`cashu.md` §5, decision
11). A losing attempt that wrote `failed` would overwrite the winner's
`done`.

## Decision

- The Cashu job claims the topups Payky's payments hold: re-read the
  operation, re-check the quote, reserve a counter, record the attempt on
  this device and write the counter to the operation before minting, insert
  the proofs, then close `done`.
- It writes nothing, and never `failed`, when someone else got there first:
  the operation is `done`; it carries a counter this device did not reserve;
  the mint answers `ISSUED` for a quote this device has not minted; or the
  mint reports the operation's own counter as already signed.
- A claim made elsewhere is waited for; after 5 minutes, if the operation
  carries the winner's counter, Payky reclaims it through NUT-09. Payky's own
  attempt that lost its response is reclaimed at once.
- A topup is closed `failed` only when the mint confirms `UNPAID` past the
  quote's expiry, as Linky does.

## Alternatives considered

A lock spanning both apps: none exists, and the mint's answers already tell
who won.

## Consequences

A claim on a device that never syncs leaves the payment waiting; without a
synced counter the merchant settles it by hand.

## Enforced by

- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > someone else got there first > an operation already done is left alone`
- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > someone else got there first > a counter this device did not reserve means Linky is claiming: nothing is written`
- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > someone else got there first > a quote ISSUED that this device never minted: nothing is written, never failed`
- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > a lost response is reclaimed from this device's own counter`
- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > a quote unpaid past its expiry is closed failed`
- `packages/core/src/cashu/cashu-topup.test.ts > claimCashuTopup > a paid quote is minted into available proofs and closed done`
