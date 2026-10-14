# 0002 The default mint is the one Linky uses

Status: accepted
Date: 2026-10-14

## Context

A Cashu payment needs a mint to issue the quote. The wallet is Linky's
(cashu/0001), and Linky keeps its default mint as the synced `setting` row
`defaultMint`, with `https://cashu.cz` (`MAIN_MINT_URL`) when none is set
(`cashu.md`, decisions 5 and 5b).

## Decision

- A payment is quoted at Linky's synced `defaultMint`, decoded as Linky
  decodes it and normalised, else at `https://cashu.cz`. Payky keeps no
  device override: Linky's exists only so its UI works before sync.
- Enabling the Cashu account writes `https://cashu.cz` when the wallet has
  no `defaultMint` yet, as Linky's onboarding does, and never overwrites one.
- The payment keeps the mint its quote is at (`paymentCashu.mintUrl`); a
  default changed later applies to new payments only.

## Alternatives considered

A mint stored on Payky's account: two defaults that drift apart, and a
payment in Payky paid into a mint Linky does not show as default.

## Consequences

A default changed in Linky moves Payky's next payments too, and the reverse.

## Enforced by

- `src/core/cashu/cashu-mints.test.ts > the default mint > is Linky's default until a wallet names one`
- `src/core/cashu/cashu-mints.test.ts > the default mint > is read from Linky's synced setting`
- `src/core/cashu/cashu-mints.test.ts > the default mint > is seeded once when Cashu is enabled, never over a mint Linky chose`
- `src/core/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > uses the default mint Linky synced`
