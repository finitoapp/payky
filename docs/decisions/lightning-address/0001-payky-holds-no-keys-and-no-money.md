# 0001 Payky holds no keys and no money for a Lightning address payment

Status: accepted
Date: 2026-10-25

## Context

Issue #163 asks that a merchant can take Lightning payments straight into a
wallet of their own (Blink, Alby, Coinos, Breez, Minibits, ...). Spark keeps
the wallet's keys in Payky; a merchant who already has a wallet wants the
money to land there and nowhere else. A Lightning address (LUD-16) lets
anyone ask that wallet for an invoice over LNURL-pay (LUD-06), and LUD-21
adds a `verify` URL that tells whether the invoice was paid. The wallets
checked answer their metadata, callback and verify with
`access-control-allow-origin`, so the PWA can reach them too.

## Decision

- A `lightningAddress` account names the merchant's address. It is its own
  kind next to Spark, has no balance and no withdrawal, and statistics count
  what it took as income.
- Every payment asks the address for an invoice of its own, for the sats the
  payment's fiat amount is worth at Yadio's rate, with the payment's number
  as a LUD-12 comment where the wallet takes one.
- Payky only watches that invoice. It never holds the money or the keys,
  and it pays nothing out of the merchant's wallet: a refund goes out as
  cash or outside Payky.
- The method is switched on in the payment methods settings only;
  onboarding does not offer it.

## Alternatives considered

- Receiving into Spark and forwarding to the address: Payky would hold the
  money, if only briefly, and pay the routing fee.
- NIP-57 zap receipts as the proof of payment: few wallets publish them for
  an ordinary invoice; not in the first version.

## Consequences

Whatever the wallet provider does with the money is between it and the
merchant. A Bolt Card tapped under the tab pays the wallet's invoice.

## Enforced by

- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > preparePaymentMethod with a Lightning address > asks the merchant's wallet for an invoice and expires with it`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > syncLightningAddressPayment > settles the payment with the preimage that proves it`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > payPaymentWithBoltCard on the Lightning address tab > hands the wallet's invoice to the card's service`
- `apps/web-app/e2e/payment-lightning-address.spec.ts > take a payment into the merchant's wallet and see it settle`
