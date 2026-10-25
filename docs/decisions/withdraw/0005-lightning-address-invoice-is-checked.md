# 0005 The invoice a Lightning address returns is checked before paying it

Status: accepted
Date: 2026-10-09

## Context

Donations only displayed the invoice a Lightning address returned; a
withdrawal pays it. LUD-06's `description_hash` commits to metadata
anyone can read, so it authenticates nothing, and several servers compute
it differently (LUD-18 payer data, Nostr zaps).

## Decision

- The invoice must be for exactly the requested msat amount, on mainnet,
  and not expired; otherwise `LightningAddressInvoiceMismatch` and nothing
  is paid. This applies to donations too.
- The LNURL callback must be `https:`. Only TLS to the address's domain
  vouches for the recipient; the review shows that domain emphasized.
- `description_hash` is not checked. The text shown as the recipient's
  is the `text/plain` entry of the metadata.
- Only Lightning addresses (LUD-16) are supported. An `lnurl1…` whose
  checksum holds and which encodes exactly
  `https://<domain>/.well-known/lnurlp/<name>` is that Lightning address
  (some wallets, such as Primal, show their address this way) and is paid
  as `name@domain`. Any other `lnurl1…` is recognized and refused with
  a clear message.

## Alternatives considered

- Checking `description_hash` = `sha256(metadata)`: it protects nothing
  and rejects legitimate servers.
- Supporting any LNURL-pay link: an arbitrary callback URL goes beyond
  LUD-16 for little gain; the LUD-16 shape covers the wallets seen so far.

## Consequences

Whoever controls the address's domain controls where the money goes;
that is the recipient's choice of provider.

A payment taken into the merchant's own Lightning address holds its
invoice to the same checks, and to a LUD-21 verify URL besides
(lightning-address/0003).

## Enforced by

- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > rejects a callback that is not https`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > accepts an invoice whatever its description_hash`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > rejects an invoice for a different amount`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > rejects a non-mainnet invoice`
- `packages/core/src/integrations/lnurl/lnurl-pay-client.test.ts > lnurl pay client > rejects an expired invoice`
- `packages/core/src/modules/withdraw/withdraw-destination-utils.test.ts > parseWithdrawDestination > reads an LNURL encoding a Lightning address as that address %#`
- `packages/core/src/modules/withdraw/withdraw-destination-utils.test.ts > parseWithdrawDestination > refuses an LNURL that is no Lightning address %#`
