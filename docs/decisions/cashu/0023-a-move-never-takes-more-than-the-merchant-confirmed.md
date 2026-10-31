# 0023 A move never takes more from the source than the merchant confirmed

Status: accepted
Date: 2026-10-29

## Context

A move is estimated first (`estimateCashuMove`): the merchant sees the most
that will leave the source, the amount plus the Lightning fee reserve and
the input fee, and confirms it with the PIN (access/0009). The move then
asked the source for a fresh melt quote and passed that quote's own total to
`meltCashu` as the limit, so the limit only compared the price with itself.
A source whose fee reserve rose between the estimate and the confirmation
took the higher price without asking. A withdrawal already passes the total
the merchant confirmed.

## Decision

- `moveCashuFunds` takes the confirmed total, the estimate's
  `totalFromSource`, and no attempt of the move takes more from the source.
- The move prices its fresh quotes before it writes the topup or the
  `cashuMove` link: a price above the confirmed total stops it with
  `CashuMoveCostRose`, nothing written and nothing paid; both quotes simply
  expire. `meltCashu` holds the same limit once more against the proofs it
  selects.
- The input fee the estimate shows is that of the proofs the melt's
  pre-swap selects, as cashu-ts selects them, never of every proof the
  source holds: those it leaves out cost nothing. The melt prices the
  proofs it selects once more against the confirmed total.
- A sweep's smaller retries stay within the same confirmed total. A sweep
  whose source balance grew since the estimate, so that it would take more,
  stops the same way.
- The screen says the fees rose and drops the estimate: the merchant
  estimates again and confirms the new price.

## Alternatives considered

- Allowing a small tolerance above the estimate: any amount the merchant did
  not see is one they did not approve, and fees move little between the two
  taps, so a fresh estimate costs little.
- Shrinking the amount until the new price fits the confirmed total: the
  merchant would move less than they asked for without being told.

## Consequences

A move confirmed just before the source raises its fees fails once and asks
for a new estimate.

## Enforced by

- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > fees that rose since the estimate stop the move before anything is written or paid`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a sweep moves everything the fees leave`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > what a melt costs (cashu/0023) > the input fee is that of the proofs the pre-swap selects, never of every proof the mint holds`
