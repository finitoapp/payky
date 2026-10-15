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
  `sat`, single use, the payment's mint only, one nostr transport to Payky's
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
  (`cashuOperationIdFor("receive|" + text)`, the text normalised as Linky
  normalises it), so it settles whoever receives the token.

## Alternatives considered

A bare `lightning:` QR only: a Cashu wallet would melt at its own mint and
pay the Lightning fee reserve.

## Consequences

Two open payments of one amount at one mint make Linky's bare token
ambiguous; it stays unassigned and pays neither.

## Enforced by

- `src/core/modules/cashu/cashu-cross-app.test.ts > cross-app Cashu vectors (shared with Linky) > NUT-18 request $request`
- `src/core/modules/cashu/cashu-cross-app.test.ts > cross-app Cashu vectors (shared with Linky) > token text of %j`
- `src/core/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > takes a NUT-18 payload sent 1:1`
- `src/core/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > takes a bare token sent 1:1, as Linky sends it`
- `src/core/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > ignores chat text, even one that mentions a token`
- `src/core/integrations/nostr/nostr-cashu-inbox.test.ts > decodeCashuTokenWrap > ignores a token sent to a group, the support room included`
- `src/core/cashu/cashu-token-listener.test.ts > matchCashuToken > a payload goes to the open payment its id names, whatever its amount`
- `src/core/cashu/cashu-token-listener.test.ts > matchCashuToken > a bare token goes to the one open payment of its face amount`
- `src/core/cashu/cashu-token-listener.test.ts > matchCashuToken > a bare token two payments fit, or none, is unassigned`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > a token Linky received first settles the payment that holds its receive`
- `src/core/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a payment paid with a NUT-18 token over NIP-17`
