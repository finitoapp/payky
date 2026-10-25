# 0006 A new Lightning address is a new account

Status: accepted
Date: 2026-10-25

## Context

Account ids derive from what identifies the account (`account-utils.ts`),
so devices configuring the same thing offline write one row. A merchant
may move to another wallet, and the payments already taken went to the old
one.

## Decision

- One Lightning address per Payky account. Its id derives from the
  lowercased address (`account:lightningAddress:<address>`), and its name is
  the address.
- Saving a different address writes a new account and retires the previous
  one in the same batch. Past transactions keep pointing at the address
  their money went to, and a payment prepared before the change still
  settles to the account it asked.

## Alternatives considered

Editing the address on one account: the history would then claim the old
payments went to the new wallet.

## Consequences

Turning the method off and on keeps the address; only a different one is a
new account.

## Enforced by

- `packages/core/src/modules/account/account-actions.test.ts > account actions > saves a new account when the Lightning address changes and keeps the old one for its history`
- `apps/web-app/e2e/payment-lightning-address.spec.ts > save a Lightning address and offer it among the payment methods`
