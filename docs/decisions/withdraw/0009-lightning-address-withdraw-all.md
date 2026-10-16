# 0009 A Lightning withdrawal may cost at most its fee estimate plus a reserve, and "withdraw all" reaches a Lightning address too

Status: accepted
Date: 2026-10-12

## Context

withdraw/0004 capped a Lightning withdrawal's fee at the estimate plus a
reserve, and left "withdraw all" out for a Lightning address: the SDK
estimates a fee only for an invoice, and a Lightning address issues one only
for an amount, which for "withdraw all" depends on the fee. But a Lightning
address takes any amount between its `minSendable` and `maxSendable`, and
the fee for a smaller amount is no higher than for a larger one. The review
showed only the maximum, although the estimate is what the merchant will
most likely pay.

## Decision

- The most a Lightning withdrawal may cost is the estimate plus 10 %, at
  least 3 sats. The review shows the estimate and that maximum on one line,
  and that whatever the fee does not use stays in the wallet. An invoice
  with a Spark fallback shows "usually free" and the maximum instead.
- The fee limit and the balance check use the Lightning estimate even for
  an invoice with a Spark fallback.
- "Withdraw all" over Lightning exists for an invoice without an amount and
  for a Lightning address, never for an invoice with an amount. It sends the
  balance minus the highest possible fee. For a Lightning address, a probe
  invoice for the balance (at most `maxSendable`) prices the fee, and a
  second invoice for the balance minus that maximum, capped at
  `maxSendable`, is the one paid; it is priced again like any other. When
  that falls below `minSendable`, the balance is insufficient.

## Alternatives considered

- Paying against a signed SSP quote with a fixed fee
  (`getLightningSendQuote`): it needs a non-default SSP schema endpoint and
  supports neither amountless invoices nor `preferSpark`. It replaces the
  reserve once the default endpoint supports it.
- Showing the estimate and the maximum on two rows: they read as two fees.

## Consequences

Tens of sats may stay behind after a "withdraw all"; a fee that rose past
the reserve makes the SDK refuse, and the merchant gets a new estimate. A
"withdraw all" to a Lightning address asks its server for an invoice it
never pays; that invoice expires. A balance above `maxSendable` sends
`maxSendable`, which the review shows as the amount.

## Enforced by

- `packages/core/src/modules/withdraw/withdraw-utils.test.ts > lightningMaxFeeSats > adds ten percent of the estimate`
- `packages/core/src/modules/withdraw/withdraw-utils.test.ts > lightningMaxFeeSats > adds at least three sats`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > prices an invoice with an amount at the estimate plus the reserve`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > prices an invoice with a Spark fallback with the Lightning estimate too`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > withdraws all to an amountless invoice as the balance minus the most the fee can be`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses an invoice whose amount and fee reserve exceed the balance`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > withdraws all to a Lightning address as the balance minus the most the fee can be`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > withdraws all to a Lightning address at most its maxSendable`
- `packages/core/src/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses to withdraw all to a Lightning address when the balance minus the fee is below its minSendable`
