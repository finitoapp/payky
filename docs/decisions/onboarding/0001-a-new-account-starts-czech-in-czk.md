# 0001 A new account starts Czech, in CZK

Status: accepted
Date: 2026-10-14

## Context

Onboarding used to open with a country-and-currency screen. Both answers
defaulted from the language the merchant read the wizard in (Czech to CZ and
CZK, Slovak to SK and EUR, anything else to "other" and USD), and the screen
only confirmed that default. Nearly every merchant Payky has today is
Czech, and the screen was one more step before the first sale.

## Decision

Onboarding asks neither question. Every new account starts with the
country CZ, which seeds the Czech tax rates, and the currency CZK, whatever
the UI language. A merchant elsewhere changes both in Settings > Business.

## Alternatives considered

- Keep deriving both from the language, with no screen: an English-reading
  merchant in Czechia would start in USD with no tax rates, and the
  language picker would silently decide business settings.
- Keep the screen: an extra step that nearly everyone accepts unchanged.

## Consequences

A Slovak or foreign merchant starts in CZK with Czech tax rates and has to
correct the country and currency in Settings and the rates by hand —
changing the country later does not reseed them. The language picker in
onboarding now changes the language only.

## Enforced by

- `e2e/onboarding.spec.ts > onboarding in English still starts a Czech account in CZK`
