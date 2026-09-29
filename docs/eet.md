# EET reporting

How a received payment becomes an EET 2.0 sale (`tržba`), gets delivered,
how a refund reverses it, and what each state and edge case means. Read it before changing
`src/core/modules/eet/*`, `eet-reporting-job.ts`, or
`src/core/integrations/eet/*`.

## Moving parts

| Piece | File | Role |
|---|---|---|
| `eetSettings` (one row, fixed id) | `modules/eet/eet.ts` | `enabledAt`, `environment`, `establishmentId`, `certificateId`, `tipOwner` |
| `eetCertificate` | same | EIC, validity, DER cert + **PKCS#8 private key** (base64), `isTestCertificate` |
| `eetSale` (id = `eetSale:<paymentId>`) | same | Frozen snapshot of what is reported + last attempt bookkeeping |
| `eetSaleConfirmation` (same id as sale) | same | FIK/`pok`, `receivedAt`, `isTest`, warnings. Its existence = confirmed |
| `eetReversal` (id = `eetReversal:<refundId>`) | same | Frozen snapshot of the negative sale one refund reports + last attempt bookkeeping |
| `eetReversalConfirmation` (same id as reversal) | same | Same as `eetSaleConfirmation`, for a reversal |
| Reporting job | `background-jobs/jobs/eet-reporting-job.ts` | Creates sales, delivers them, backs off |
| Client | `integrations/eet/eet-client.ts` | Signs + submits via `@finitoapp/eet-client`, maps errors to `retry`/`rejected` |
| Response verifier | `integrations/eet/eet-response-verifier.ts` | Checks the response signature |
| Playground certs proxy | `api/eet/playground-certificates.ts` | Downloads the official test-cert ZIP from eet.gov.cz, returns `.p12` + password |

All tables live in the **app** Evolu database, so settings, the certificate
with its private key, and every sale sync to all devices of the account
(end-to-end encrypted by Evolu).

## Setup

1. **Certificate.** Either upload a `.p12` + password (`isTestCertificate: false`)
   or pick one of the official playground certificates (`isTestCertificate: true`).
   The file is rejected if the password is wrong, it has no private key, the
   CN is not an EIC (`CZ` + 8–10 digits), or it is expired / not yet valid.
   Storing a new certificate soft-deletes the previous one.
2. **Establishment id** (`id_jednotky`, 1–9 digits, no leading zero).
3. **Environment** — resolved by `resolveEetEnvironment`:

   | Build has `VITE_PAYKY_EET_PRODUCTION_URL` | Test certificate | Result |
   |---|---|---|
   | no | any | `playground` |
   | yes | yes | `playground` |
   | yes | no | stored `environment`, default `production` |

   `selectEetEnvironment("production")` refuses without a production URL or
   with a test certificate.
4. **Enable.** `enableEet` requires a non-expired certificate and an
   establishment id, then sets `enabledAt = now`. Disabling sets it to `null`.
   While enabled in `playground`, the terminal shows the sandbox banner and
   the payment-wait screen says so.
5. **Tip owner** — `business` (default): tip is part of the reported sale;
   `employees`: tip is subtracted (`calculatePaymentBaseAmount`).

The settings page also has a test card: a verification message (`overovaci`
mode, anywhere) or a real 1.00 CZK test sale (playground only). Neither writes
an `eetSale`.

## Which payments get reported

`eetPaymentsToReportQuery(deviceId)` selects a payment when **all** hold:

- `payment.deviceId` is **this** device (only the device that created the
  payment reports it),
- EET is enabled (`enabledAt !== null`),
- it has an active reconciliation claim, and the **first** claim's
  `claimedAt >= enabledAt`,
- no `eetSale` exists for it yet.

Payment status is ignored: a canceled payment that still got a claim is
reported (money arrived). The payment method does not matter either — cash,
card, Lightning and IBAN are all reported; the method of the first claim is
stored in `eetSale.method` but not sent.

## Sale creation — what gets frozen

`createEetSale` writes the row once and never rewrites the reported data:

| Field | Value |
|---|---|
| `amount` | `payment.amount` (fiat minor units), or the cash received when the first claim is the cash register, minus tip when `tipOwner = employees` |
| `saleAt` (`dat_trzby`) | first claim's `claimedAt` |
| `sequenceNumber` (`porad_cis`) | the payment id |
| `cashRegisterId` (`id_pokl`) | first 20 chars of the device id — one register per device |
| `eic`, `establishmentId`, `environment` | current settings at creation time |
| `unsupportedReason` | `currency` if not CZK, `amount` if > 99 999 999.99 |

Later changes to settings (tip owner, environment, establishment) affect only
sales created afterwards — with one exception in "Manual retry" below.

## Delivery

The job subscribes to two queries for sales and two for reversals (see
"Refunds and storno") and runs through a keyed queue (one `create` and one
`deliver` pass at a time):

- `eetSalesToDeliverQuery(deviceId)`: this device's sales that are supported,
  unconfirmed and whose `lastAttemptResult` is `null` or `retry`.
- Each delivery takes a Web Lock `eet-sale-<id>` (`ifAvailable`); if held,
  it is skipped as `EetSaleBusyError`.
- Signing always uses the **current** certificate, not the one active when the
  sale was created.
- Before the message leaves, the attempt is written as `attemptStartedAt` in
  its own batch. The outcome later sets `lastAttemptAt` to the same instant.
  An attempt that finds an `attemptStartedAt` with no `lastAttemptAt`, or a
  later one, inherits an attempt whose answer never arrived (the app closed
  mid-request) and sets `hadUnansweredAttempt`.
- `prvni_zaslani` (`firstSubmission`) is `true` only while the sale has no
  attempt (`attemptStartedAt` and `lastAttemptAt` both `null`).

Outcome mapping (`eet-client.ts`):

| Situation | Outcome | `unanswered` |
|---|---|---|
| Accepted with FIK | `accepted` → writes `eetSaleConfirmation` | — |
| Network, timeout, HTTP, SOAP fault, bad XML, bad response schema | `retry` | yes |
| EET error code `-1` or `8` | `retry` | no |
| Build lacks production URL for a `production` sale | `retry` | no |
| Response signature invalid | `rejected` | **yes** |
| Any other EET error code, validation, too large, signer error, bad local data | `rejected` | no |

`unanswered: true` sets `hadUnansweredAttempt` (sticky, never cleared): EET
may have recorded the sale even though we got no usable answer.

Backoff for `retry`: 30 s · 2^(n−1), capped at 15 min, **no attempt limit**.
The backoff lives in memory: an app restart or an `online` event retries
immediately, also when the event arrives while an attempt is in flight. `rejected` sales are never retried automatically.

## Sale status

`deriveEetSaleStatus`, first match wins:

| Status | Condition |
|---|---|
| `testConfirmed` | confirmation exists and (`isTest` or sale env is `playground`) |
| `confirmed` | confirmation exists |
| `unsupported` | `unsupportedReason !== null` — never sent |
| `rejected` | `lastAttemptResult = rejected` |
| `pending` | everything else (not tried yet, or waiting for retry) |

**Overdue**: `pending` or `rejected` more than 48 h after `saleAt`. Shown as
a badge suffix and a warning on the payment detail.

Status is shown on the payment detail (with FIK, warnings, last error,
technical ids), per payment on the bill detail, and all unconfirmed sales of
the account are listed in Settings → EET.

## Manual retry

Payment detail offers **Retry** for `pending` and `rejected`. `retryEetSale`:

- If **every** attempt was rejected (no unanswered or cut-off one, no FIK) and the
  current settings have a different EIC or establishment id, it first
  rewrites those two fields on the sale — EET never saw the sale, so fixing
  a typo is safe. Otherwise the frozen data stays.
- Then delivers exactly as the job does (same lock, same outcome recording).

Retry works from **any** device, not just the one that owns the sale.

## Refunds and storno

A refund (`refundPayment` in `modules/refund`) returns money for a paid
payment, as an amount or as items. The payment stays paid and its bill stays
closed (see `bill-payment-states.md`). EET 2.0 has no storno message: a
reversal is a new sale with a negative amount and no link to the original.

`eetRefundsToReverseQuery(deviceId)` selects a refund when it was recorded
on **this** device, its payment has a supported `eetSale`, and no reversal
exists for it yet. `createEetReversal` freezes:

| Field | Value |
|---|---|
| `amount` | refund amount, capped at the sale's `amount` minus earlier supported reversals. Stored positive, sent negated (`-250.00`) |
| `saleAt` (`dat_trzby`) | the refund's `refundedAt` |
| `sequenceNumber` (`porad_cis`) | the refund id |
| `cashRegisterId` (`id_pokl`) | the device that recorded the refund |
| `eic`, `establishmentId`, `environment` | current settings at creation time |
| `unsupportedReason` | `disabled` if EET is off or not set up, `environment` if the current environment is not the sale's, `taxpayer` if the current EIC is not the sale's |

`eetReversalsToDeliverQuery(deviceId)` holds a reversal back until its sale
has a confirmation, so EET never gets the reversal first. Delivery then
follows the sale's rules: Web Lock `eet-reversal-<id>`, the same outcome
mapping, backoff, status, overdue and manual retry. Manual retry never
rewrites a reversal's frozen data.

Each refund shows its reversal status on the payment detail, and Settings →
EET lists unconfirmed reversals next to unconfirmed sales.

## Edge cases

| Case | Behavior |
|---|---|
| Payment claimed while EET was disabled | Never reported, even after enabling |
| Disable → re-enable | `enabledAt` moves forward; payments claimed before the new `enabledAt` whose sale was not created yet (device was offline/closed) are **never reported** |
| Disable with pending sales | Delivery continues; disabling only stops new sales |
| Claim removed after the sale was created | Sale still reported; no correction/storno is sent |
| Refund before the sale was created | The reversal is created once the sale exists |
| Refund of a payment with no sale or an unsupported sale | No reversal |
| Refunded tip that employees own | Not reversed: the cap is what the sale reported |
| Sale pending or rejected | Its reversals wait, for good if the sale is never confirmed |
| EET disabled, or environment or EIC changed, when the reversal is created | Reversal `unsupported`, never sent |
| Claim removed before creation | Not reported (query needs an active claim) |
| Overpaid / multiple claims | One sale for `payment.amount`; extra money is not reported |
| Cash rounded or change left | The sale reports the cash received (78.90 charged, 79 or 80 received); the payment, its claim and the cash register keep 78.90 |
| Cash payment settled before the received amount was recorded | Reports `payment.amount` |
| Underpaid claim | Still `payment.amount` |
| Non-CZK payment | `unsupported`, never sent |
| Owning device offline for days | Sales wait; become overdue after 48 h |
| Owning device lost | Its sales are only delivered by someone tapping Retry on another device |
| Certificate expires while enabled | Nothing stops creation/delivery; EET rejects; after replacing the cert every rejected sale must be retried one by one |
| Certificate replaced with a different EIC | Pending sales keep the old EIC but are signed with the new cert. Retry fixes the EIC only if all prior attempts were rejected |
| Environment switched while sales are pending | Each sale keeps its env: old playground sales still go to playground, signed with the new (maybe production) cert, and vice versa |
| Playground `.p12` uploaded as a file | Stored as a non-test certificate → can resolve to `production` |
| `production` sale synced into a build without production URL | Retries every 15 min forever |
| App closed while an attempt waits for its answer | The next attempt is a repeat and the record counts as possibly recorded by EET |
| Two devices retry the same sale | Web Lock is per browser, not per account: both may submit; the confirmation row is last-write-wins |
| Clock skew | `claimedAt` and `enabledAt` come from different device clocks; a claim just after enabling can fall before `enabledAt` |

## Known gaps

1. **No correction for removed claims.** Refunds are reversed (see
   "Refunds and storno"), but removed claims and canceled-but-paid payments
   have no negative sale path.
2. **Silent loss on re-enable.** The `claimedAt >= enabledAt` rule drops
   payments whose sale creation had not run before a disable/enable cycle.
   A persisted "disabled since/until" window would fix it.
3. **Reported amount is `payment.amount` for every method but cash.** Cash
   reports what was received; over- and underpayments of other methods are
   not reflected.
4. **All payment methods are reported.** `method` is stored but unused; if
   some methods (e.g. bank transfer) should not be EET sales, nothing filters them.
5. **Delivery bound to the creating device.** No automatic takeover when that
   device disappears.
6. **Expired certificate is not a gate.** Only the settings card warns
   (21 days ahead); nothing warns on the terminal, and sales keep failing.
7. **No bulk retry** of rejected sales after a configuration fix.
8. **Response verifier checks only** the signer's `O` field
   (`Generální finanční ředitelství`), validity dates and the signature — no
   chain to a trusted CA, so a self-signed cert with that `O` passes.
9. **Endless retry** with no cap and no escalation beyond the overdue badge.
10. **Private key syncs to every device** of the account (encrypted, but
    a compromised device leaks the signing key).
11. **Sale time = claim time**, not when the customer paid; for an IBAN
    transfer matched later by bank sync, `dat_trzby` is the match time.
