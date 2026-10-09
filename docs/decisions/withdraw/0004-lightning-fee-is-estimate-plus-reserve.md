# 0004 A Lightning withdrawal may cost at most its fee estimate plus a reserve

Status: accepted
Date: 2026-10-09

## Context

The SDK charges a fresh fee estimate when it sends and refuses when that
exceeds `maxFeeSats`. The fee can rise between review and confirmation.
An invoice with a Spark fallback is usually paid over Spark for free, but
the SDK silently pays over Lightning when the fallback does not decode.

## Decision

- The most a Lightning withdrawal may cost is the estimate plus 10 %, at
  least 3 sats. The review says so, and that whatever the fee does not use
  stays in the wallet.
- The fee limit and the balance check use the Lightning estimate even for
  an invoice with a Spark fallback.
- "Withdraw all" over Lightning exists only for an invoice without an
  amount: it sends the balance minus the highest possible fee. A Lightning
  address or an invoice with an amount does not offer it; an amount that
  does not fit says how much at most can go.

## Alternatives considered

Paying against a signed SSP quote with a fixed fee (`getLightningSendQuote`):
it needs a non-default SSP schema endpoint and supports neither amountless
invoices nor `preferSpark`. It replaces the reserve once the default
endpoint supports it.

## Consequences

Tens of sats may stay behind after a "withdraw all"; a fee that rose past
the reserve makes the SDK refuse, and the merchant gets a new estimate.

## Enforced by

- `src/core/modules/withdraw/withdraw-utils.test.ts > lightningMaxFeeSats > adds ten percent of the estimate`
- `src/core/modules/withdraw/withdraw-utils.test.ts > lightningMaxFeeSats > adds at least three sats`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > prices an invoice with an amount at the estimate plus the reserve`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > prices an invoice with a Spark fallback with the Lightning estimate too`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > withdraws all to an amountless invoice as the balance minus the most the fee can be`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses an invoice whose amount and fee reserve exceed the balance`
