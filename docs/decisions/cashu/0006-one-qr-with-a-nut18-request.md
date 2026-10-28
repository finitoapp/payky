# 0006 One QR with a NUT-18 request over nostr, matched by id, else by mint and amount

Status: accepted
Date: 2026-10-14

## Context

The customer scans one QR (`cashu.md`, decisions 3, 3b, 3c). A Lightning
wallet pays an invoice; a Cashu wallet with NUT-18 sends a token. Linky as a
payer sends a bare token that names no request.

## Decision

- The Cashu tab shows `bitcoin:?lightning=<bolt11>&creq=<creqA…>`. The
  request is Linky's `encodeNostrPaymentRequest` byte for byte: the sats,
  `sat`, single use, the payment's mint only (since `cashu/0017` the trusted
  mints, the default first), one nostr transport to Payky's
  nprofile over the relays it listens on, tagged `["n", "17"]`, and the
  payment id as `i`. It is rebuilt from `paymentCashu`, never stored.
- Tokens reach Payky only as NIP-17 messages to its key; no HTTP `post`
  transport, paste or NFC. A message counts when its room is 1:1 and it is a
  kind 14 whose content is a NUT-18 payload or a bare `cashuA…`/`cashuB…`
  token; anything else is ignored without being logged or stored.
- A payload goes to the open payment its id names, from that payment's mint;
  a bare token to the one open payment of its mint and face amount. Otherwise
  the token is received unassigned. `cashu/0011` dropped both mint
  conditions: a payload goes to the open payment it names, a bare token to
  the one open payment of its face amount.
- Before anyone receives a matched token, the payment holds its receive id
  (`cashuReceiveOperationIdFor(text)`, the text normalised by
  `normalizeCashuTokenText`), so it settles whichever Payky device receives
  the token (cashu/0014, cashu/0015).

## Alternatives considered

A bare `lightning:` QR only: a Cashu wallet would melt at its own mint and
pay the Lightning fee reserve.

## Consequences

Two open payments of one amount at one mint make Linky's bare token
ambiguous; it stays unassigned and pays neither.

## Enforced by

- `packages/core/src/cashu/cashu-payment-request.test.ts > the Cashu tab's payment request > NUT-18 request $request`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > Cashu ids and spellings > token text of %j`
- `packages/core/src/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > takes a NUT-18 payload sent 1:1`
- `packages/core/src/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > takes a bare token sent 1:1, as Linky sends it`
- `packages/core/src/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > ignores chat text, even one that mentions a token`
- `packages/core/src/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > ignores a token sent to a group, the support room included`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > matchCashuToken > a payload goes to the open payment its id names, whatever its amount`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > matchCashuToken > a bare token goes to the one open payment of its face amount`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > matchCashuToken > a bare token two payments fit, or none, is unassigned`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a received token is booked at its face value less the fee in the batch that completes it, and claims the payment holding its receive`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a payment paid with a NUT-18 token over NIP-17`
