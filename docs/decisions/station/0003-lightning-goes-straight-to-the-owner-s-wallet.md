# 0003 Lightning goes straight to the owner's wallet and is settled from it

Status: accepted
Date: 2026-10-07

## Context

A station device is run by staff and may be lost. Bitcoin held on it would
have to be swept to the owner later. Spark lets a wallet create a Lightning
invoice whose money goes to another identity (`receiverIdentityPubkey`), and
the creator can still read the receive request. Checked on regtest: the
station's balance stays zero, the owner receives exactly the invoiced sats,
and the owner's wallet lists the transfer with the receive request attached.

## Decision

A station's Spark account holds the station's own wallet secret and the
owner wallet's identity key. Its invoices name the owner as receiver and
carry no Spark invoice, which would pay the owner without the station ever
seeing the request settle. The station polls the receive request and records
the payment paid only once its status is `TRANSFER_COMPLETED`; the transfer id
shows up a moment earlier and is no sign of payment. On the owner, the
ordinary Spark sync records the transfer and claims the station's projected
payment by its invoice.

## Alternatives considered

The station receiving into its own wallet and forwarding: bitcoin at rest on
staff devices, and fees. A separate owner-side check of each transfer a
station reports: the normal sync already sees the transfer with its invoice.

## Consequences

The station's Lightning works only while it can reach Spark. The owner's
wallet settles a station payment whenever it next syncs; it does not have to
be online at the moment of payment.

## Enforced by

- `src/core/modules/payment/payment-preparation-actions.test.ts > payment preparation actions > at a PoS station > pays the owner's wallet and leaves the Spark invoice out`
- `src/core/background-jobs/jobs/station-lightning-watch-job.test.ts > station lightning watch job > records an invoice paid once its transfer completes, not when its id shows`
- `src/core/modules/station/station-config-actions.test.ts > applyStationConfig > sets the station up on the owner's accounts, employees and settings`
