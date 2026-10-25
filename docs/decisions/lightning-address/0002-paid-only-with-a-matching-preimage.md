# 0002 A Lightning address payment is paid only by a preimage that matches its invoice

Status: accepted
Date: 2026-10-25

## Context

LUD-21's verify answers `settled`, `preimage` and the invoice (`pr`) it
speaks of. `settled` is only the wallet's word: a misconfigured or hostile
endpoint can say `true` for anything, and some wallets (ZEUS Pay) answer
`settled: true` without a preimage at all. The preimage is the one proof a
Lightning payment carries: its SHA-256 is the invoice's payment hash, and
only the payer's route learns it when the invoice is paid.

## Decision

- A poll counts the payment as paid only when the verify answer's `pr` is
  the invoice Payky stored (compared lowercased, without a scheme) and its
  preimage is 32 bytes whose SHA-256 is that invoice's payment hash.
- `settled: true` without a preimage, or with one that does not match,
  writes nothing; the wait screen warns that the wallet sent no proof of
  payment. An answer about another invoice is an error.
- The verify URL must be `https:`, as the callback must (withdraw/0005).
- A valid preimage books the account transaction (in sats), its claim and
  the preimage in one batch, under ids derived from the account and the
  payment hash, so two devices that saw it write the same rows. No status
  guard stands in front: the money is already in the merchant's wallet, so
  a payment canceled or expired meanwhile ends up claimed, the collision
  payment/0004 describes.

## Alternatives considered

Trusting `settled`: it would mark payments paid on a wallet's word alone,
the one thing Payky cannot check afterwards.

## Consequences

Wallets whose verify never reveals the preimage, such as ZEUS Pay, cannot be
used: their payments never settle in Payky, though the money arrives.

## Enforced by

- `packages/core/src/modules/shared/lightning-invoice-utils.test.ts > verifyLightningPreimage > accepts the preimage whose SHA-256 is the invoice's payment hash`
- `packages/core/src/modules/shared/lightning-invoice-utils.test.ts > verifyLightningPreimage > rejects a preimage of another invoice`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > never polls a verify URL that is not https`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > writes nothing when the wallet says settled without a preimage`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > writes nothing for a preimage of another invoice`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > refuses an answer about another invoice`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > still books money that arrives after the payment was canceled`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > two polls of a paid invoice write one transaction and one claim`
- `apps/web-app/e2e/payment-lightning-address.spec.ts > a wallet that says paid without a preimage does not settle the payment`
