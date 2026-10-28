# 0015 Someone else first is another Payky device; a token Linky took stays unpaid

Status: accepted
Date: 2026-10-26

## Context

`cashu/0004` stopped Payky when Linky or another device had claimed first,
because both apps wrote one wallet. With a wallet of Payky's own
(cashu/0012) only Payky devices of the same account write it. The nostr key
stays the primary Payky npub, which Linky also holds (R4): a running Linky
auto-accepts tokens sent to that npub, now into its own, separate wallet.

## Decision

- The claim of a topup and the swap of a token re-read the operation,
  reserve a NUT-13 counter and write it to the operation, with this device's
  attempt, in one batch before the mint is called.
- Payky writes nothing, and never `failed`, when another Payky device got
  there first: the operation is `done`; it carries a counter this device did
  not reserve; the mint answers `ISSUED` for a quote this device has not
  minted; or the mint reports the operation's own counter as already signed.
- A claim made elsewhere is waited for; after 5 minutes, if the operation
  carries that device's counter, Payky reclaims it through NUT-09. This
  device's own attempt that lost its response is reclaimed at once.
- A topup is closed `failed` only when the mint confirms `UNPAID` past the
  quote's expiry.
- Collisions with another device's slots are recovered past the last signed
  one, and a device's first use of a keyset restores it (NUT-09) and starts
  past what is signed.
- A token another wallet already spent — Linky on the same npub, or a
  customer's double spend — is `receivedElsewhere`: nothing is written, the
  payment stays unpaid, and the wait screen says another wallet received the
  token. The merchant settles it; the money is in their Linky.

## Alternatives considered

- A nostr key of Payky's own for NUT-18: customers would pay a key Linky does
  not hold, but the owner chose one npub for both apps (R4).
- Booking what Linky received: Payky no longer sees Linky's operations.

## Consequences

The owner is advised not to run Linky on the same key while working the
till: a quicker Linky takes the token and the payment shows unpaid.

## Enforced by

- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > an operation already done is left alone`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > a counter this device did not reserve means another device is claiming: nothing is written`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > a quote ISSUED that this device never minted: nothing is written, never failed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a lost response is reclaimed from this device's own counter`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a quote unpaid past its expiry is closed failed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > collisions with slots another device used are recovered`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a new device restores the keyset before its first claim and starts past what is signed`
- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > cashu counters > a collision with slots another device used jumps past the last signed one`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > another device received it: done, nothing written`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > a receive another device has pending: nothing is written, never failed`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a token another wallet already spent is received elsewhere, writing nothing`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0015)`
