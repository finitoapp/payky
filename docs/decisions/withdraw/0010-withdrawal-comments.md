# 0010 A withdrawal carries a message for the recipient and a note for the merchant, kept apart

Status: accepted
Date: 2026-10-13

## Context

Merchants want to say what a withdrawal was for, to the recipient or to
themselves. Only a Lightning address can carry a message to the recipient:
LUD-12 lets its server accept a `comment` up to `commentAllowed`
characters. An invoice's description is fixed by whoever issued it, and an
on-chain exit carries no message at all. A note the merchant keeps for
themselves needs no recipient and works for every destination.

## Decision

- **Message for the recipient**: offered only for a Lightning address
  whose metadata has `commentAllowed > 0`. It is trimmed, cut to
  `commentAllowed` characters and sent as `comment` with the invoice
  request; a blank one is not sent. With "withdraw all" (withdraw/0009)
  only the invoice that is paid carries it, not the probe. It is shown on
  the review and not stored.
- **Note for the merchant**: offered for every destination, stored as
  `withdrawal.comment` (at most 255 characters, blank stored as `null`),
  and never sent anywhere. The review, the withdrawal history and the
  withdrawal detail show it.
- The two are separate fields, both under "More options" on the form.
- The note belongs to the withdrawal, not to its account transaction: the
  withdrawal action is its only writer, while a Lightning movement is
  written by the Spark sync job (withdraw/0002).

## Alternatives considered

- One field that goes to the recipient where it can and stays private
  elsewhere: a note meant to stay private would leave unnoticed whenever
  the destination is a Lightning address.
- Storing the note in `accountTransaction.note`: it would have to travel
  through the sync job for Lightning, and the movement may not exist yet.

## Consequences

A message for the recipient is not kept: once sent, the app cannot show it
again. A note cannot be edited after the withdrawal is sent.

## Enforced by

- `src/core/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > reads how long a comment the recipient accepts`
- `src/core/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > sends a comment trimmed and cut to what the recipient accepts`
- `src/core/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > sends no comment to a recipient that accepts none`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > sends the recipient comment only with the Lightning address invoice it pays`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > sends no recipient comment to a Lightning address that accepts none`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > records the merchant's comment with the withdrawal`
- `src/core/modules/withdraw/withdraw-queries.test.ts > withdrawal queries > carries the merchant's comment to the history and the detail`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > sends a Lightning address the comment it accepts and saves the merchant's own`
