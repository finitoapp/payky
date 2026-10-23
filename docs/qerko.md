# Qerko card terminal

Qerko (`/api/v4/pos`, <https://qerko.com>) drives a card payment terminal
remotely over HTTP: start a payment, poll it, cancel it, refund it. Its CORS is
open, so unlike SwitchioPay (Android intents) it works in the PWA as well. The
contract is the OpenAPI document at `<base URL>/openapi.json`; the sandbox is
`https://sandbox.qerko.com/api/v4/pos`.

Decisions: [`docs/decisions/qerko/`](decisions/qerko/).

## Pieces

| What | Where |
| --- | --- |
| HTTP client (config dep + Tasks) | `packages/core/src/integrations/qerko/qerko-client.ts` |
| Pairing, the key (`qerkoPlugin`) | `packages/core/src/modules/qerko-plugin/` |
| The terminal a device pays on | `packages/core/src/evolu/device-qerko.ts` (device database) |
| Account kind `qerkoTerminal`, `paymentQerkoTerminal` | `modules/account/`, `modules/payment/payment.ts` |
| Start, poll, cancel a payment | `modules/payment/payment-qerko-actions.ts` |
| Refund to the card | `modules/refund/refund-qerko-actions.ts` |
| Background polling | `background-jobs/jobs/qerko-terminal-sync-job.ts` |

## Pairing

1. `request-pairing` with the company's id and country (CZ, SK, DE, AT, HU)
   makes Qerko e-mail a four-digit code to the company; it answers a
   `pairingRequestId` and how long until the code may be sent again.
2. `confirm-pairing` with the code answers `ok` (the API key), `invalidCode`
   (with the attempts left), `codeExpired` or `maxAttemptsReached`.
3. `get-terminals` with the key names the company and lists locations and
   terminals; only activated ones are offered. The choice is saved on the
   device.

Neither pairing call carries a key, only the `Pos-Id` header; every other call
sends `Pos-Id` and the key as a bearer token. The environment (production or
sandbox) is chosen under "Additional options" when pairing and stored with the
key.

## A payment

`startQerkoTerminalPayment` stores a fresh UUID as the pending attempt, then
calls `create-terminal-payment` with the total (tip included), the tip and the
payment number as `referenceId`. `syncQerkoTerminalPayment` polls
`get-terminal-payment-status` for the pending attempt:

| Qerko says | Payky does |
| --- | --- |
| `pending` + a step | shows the step; Cancel while the card is not yet being authorized |
| `approved` | records the money (`chargedAmount`), keeps the receipt fields, clears the attempt |
| `failed` (declined, cancelled, reversed) | clears the attempt, keeps the reason on the payment's row |
| `unknown` | moves the attempt to unresolved: a confirmed retry is needed |
| `unknownTransaction` | ends the attempt without money, after a grace period |

`create-terminal-payment` answering anything but `started` (busy, terminal not
connected, ...) clears the attempt; an upstream timeout makes it unresolved.

## A refund to the card

`create-terminal-refund` takes the `refundId` from the payment's receipt. The
attempt lives in `qerkoTerminalRefundAttempt` until the terminal approves it;
see `qerko/0004`.

## Running against the sandbox

`VITE_PAYKY_QERKO_POS_ID` (web) and `EXPO_PUBLIC_PAYKY_QERKO_POS_ID` (native)
set the `Pos-Id` header; the sandbox accepts any value. Pair with a test
company, choose "Sandbox" under "Additional options", and the terminal is the
sandbox's.
