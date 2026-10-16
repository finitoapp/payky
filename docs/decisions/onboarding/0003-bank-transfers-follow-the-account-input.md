# 0003 Bank transfers follow the account input

Status: superseded by onboarding/0005
Date: 2026-10-16

## Context

Onboarding offered both a bank-transfer checkbox and a bank-account input.
Entering an account already expresses the intent to accept bank transfers,
so a second opt-in adds an unnecessary choice.

## Decision

The payment-methods screen always shows an optional bank-account input and
has no bank-transfer checkbox. A blank or whitespace-only input finishes
without bank transfers; any other input must be a valid Czech account number
or IBAN before onboarding can finish. A valid account enables bank transfers
and is stored as IBAN. Cash and Bitcoin keep their independent on/off controls.

The finish button says “Start without bank transfers” when the account is
blank, and “Start using Payky” otherwise. The label describes the choice;
validation still runs on submission rather than while the merchant types.

The first enabled method in the onboarding payment-method order remains the
default, so skipping bank transfers makes Bitcoin or cash the default when
either is enabled.

## Alternatives considered

- Keep the checkbox: it duplicates the intent expressed by the input.
- Keep a fixed finish label: it does not make skipping bank transfers explicit.
- Silently skip an invalid account: it would hide a mistake and unexpectedly
  turn off a payment method the merchant intended to use.

## Consequences

A merchant can start without a bank account and add it in settings later.
Clearing the account input is how they opt out of bank transfers during
onboarding; an unfinished account number must be fixed or cleared.

## Enforced by

- `e2e/onboarding.spec.ts > the payment methods step derives bank transfers from the account input`
- `e2e/onboarding.spec.ts > bank account format switching is only offered for a saved Czech account`
- `src/features/onboarding/onboarding-utils.test.ts > onboarding payment method order > opens on the first enabled method when bank transfer is off`
