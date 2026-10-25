# 0003 The address and every invoice it issues must offer LUD-21 verify

Status: accepted
Date: 2026-10-25

## Context

Without a verify URL Payky has no way to learn that an invoice it did not
issue itself was paid. Wallets differ: Wallet of Satoshi, for one, returns
invoices without `verify`. A wallet may also change what it supports after
the address was saved.

## Decision

- Saving the address probes it: its metadata must load and an invoice for
  its `minSendable` must come with a `verify` URL, or the address is
  refused with `LightningAddressVerifyUnsupported`.
- Every payment's invoice is held to the checks a withdrawal applies
  (withdraw/0005: exact msat amount, mainnet, not expired, an `https`
  callback), and is refused too when it has no `verify` URL, a verify URL
  that is not `https`, or no payment hash. An amount outside the wallet's
  `min/maxSendable` is refused before an invoice is asked for.
- Whether the wallet then reveals the preimage shows only once a payment is
  paid (lightning-address/0002).

## Alternatives considered

Accepting an address without verify and asking staff to confirm by hand:
nothing in Payky could tell them whether the money arrived.

## Consequences

The settings say only that the wallet must support LUD-21 with the
preimage; there is no list of wallets in the app, which would go stale.

## Enforced by

- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > probeLightningAddress > accepts an address whose invoices carry a verify URL`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > probeLightningAddress > rejects an address without LUD-21 verify`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > preparePaymentMethod with a Lightning address > refuses an invoice without a LUD-21 verify URL`
- `packages/core/src/modules/payment/payment-lightning-address-actions.test.ts > preparePaymentMethod with a Lightning address > refuses an amount below what the wallet accepts`
- `apps/web-app/e2e/payment-lightning-address.spec.ts > refuse a wallet that cannot tell whether an invoice is paid`
