# 0014 A Cashu withdrawal withdraws all to a Lightning address as Spark's does

Status: accepted
Date: 2026-10-15

## Context

withdraw/0011 left "withdraw all" from a mint for later: the mint's fee
reserve is quoted only for an invoice, and a Lightning address issues one
only for an amount, which for "withdraw all" depends on that fee. Spark has
the same problem and solves it with one probe (withdraw/0009). A melt quote
is free and moves no proof, the reserve does not grow when the amount
shrinks, and neither does the input fee.

## Decision

- "Withdraw all" from one mint exists for a Lightning address, never for an
  invoice with an amount. A probe invoice for the mint's available balance,
  at most `maxSendable`, is quoted at the mint; the invoice paid is for the
  balance minus that quote's fee reserve and input fee, capped at
  `maxSendable`, and is quoted again like any other. Below `minSendable` the
  balance is insufficient.
- As for Spark, the quote refuses an amount outside the Lightning address's
  range and an amount the mint's balance cannot cover with its fees, naming
  the most it could send. The form, the errors and their wording are
  Spark's.
- An invoice without an amount stays refused for Cashu: a melt can pay one
  only at a mint that offers NUT-05 `amountless`, and the default mint does
  not.

## Alternatives considered

- Searching for the largest amount over several quotes: one probe suffices
  for the same reason as Spark's.
- Offering an amountless invoice where the mint supports it: no mint Payky
  uses does yet.

## Consequences

The fee reserve the melt does not use comes back as change, so a few sats
stay at the mint after "withdraw all", as with Spark. The probe asks the
Lightning address for an invoice nobody pays. The balance is the stored
one; a proof found spent at melt time refuses the melt before anything
moves, and the merchant gets a new quote.

## Enforced by

- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > withdraw all to a Lightning address > sends the balance minus the mint's fee reserve and input fee`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > withdraw all to a Lightning address > sends at most the Lightning address's maxSendable`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > withdraw all to a Lightning address > is refused when the balance minus the fees is below the Lightning address's minSendable`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > withdraw all to a Lightning address > melts it and books what left; the unused reserve stays at the mint`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > refuses an amount outside the Lightning address's range`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > refuses an invoice whose amount and the mint's fees exceed the balance, naming the most it can send`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > an invoice without an amount is refused`
