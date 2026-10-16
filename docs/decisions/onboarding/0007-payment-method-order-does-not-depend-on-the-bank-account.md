# 0007 Payment-method order does not depend on the bank account

Status: accepted
Date: 2026-10-16

## Context

Onboarding/0006 moved Spark and Cashu ahead of bank transfers and cards when
no bank account was entered. This made the settings order depend on which
methods were enabled during setup instead of keeping one initial order.

## Decision

Every newly onboarded account stores this order: bank transfer, card, Spark,
Cashu, cash. The stored `defaultPaymentMethod` is the first entry, `iban`,
just as when the merchant reorders methods in settings. The order and its
first entry are independent of whether a bank account was entered.

The payment screen offers only enabled, available methods and opens on the
first one. Without a bank account or card terminal, this is Spark; disabled
methods retain their positions in settings. Cashu stays immediately after Spark.

This supersedes onboarding/0006 and preserves all its other rules: cash and
Spark start enabled without onboarding switches or explanatory copy, Cashu
starts disabled, and bank-account validation and business-name publication
are unchanged. Existing accounts retain their saved preferences; there is no
migration of their order or enabled methods.

## Alternatives considered

- Move the first enabled method to the front: changes settings order when
  optional methods are unavailable.
- Change the shared order reader: unnecessary when onboarding can store the
  same consistent order and first entry as the existing settings action.

## Consequences

The stored default names the first method in the configured order; the first
available method is what the merchant sees selected during payment. Existing
accounts created with the previous order can be reordered in settings.

## Enforced by

- `apps/web-app/src/features/onboarding/onboarding-utils.test.ts > onboarding payment method order > keeps bank transfer and card before Spark and Cashu after reading settings`
- `apps/web-app/e2e/onboarding.spec.ts > onboarding enables cash and Spark with bank transfers`
- `apps/web-app/e2e/onboarding.spec.ts > onboarding enables cash and Spark without bank transfers`
- `packages/core/src/modules/app-settings/app-settings-actions.test.ts > finishOnboarding > enables cash and Spark without a bank account and leaves Cashu disabled`
- `packages/core/src/modules/app-settings/app-settings-actions.test.ts > finishOnboarding > writes no row on an onboarded account`
- `apps/web-app/e2e/onboarding.spec.ts > the payment methods step derives bank transfers from the account input`
