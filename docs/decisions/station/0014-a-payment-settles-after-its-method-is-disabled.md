# 0014 A payment settles after its method is disabled

Status: accepted
Date: 2026-10-07

## Context

The owner can turn a payment method off for a station at any time, and the
next config retires the station's copy of that account (station/0008). A
customer may already be paying: a bank transfer on its way, a Lightning
invoice on screen, cash on the counter. The same holds on the owner, which
can disable its own cash register or bank account while a payment into it is
pending.

## Decision

Disabling a method stops new charges only. A payment already made into the
account still settles there: a cash or bank confirmation finds the account
even when it is disabled, the owner's bank or Lightning settlement applies on
the station, and the station keeps polling the Lightning invoices it handed
out with its wallet secret.

## Alternatives considered

Keeping the station's accounts live and hiding the disabled method in the
UI: every screen that lists methods would need the extra rule, and new
charges would rely on it. Refusing the settlement: the owner holds the money
while the station shows the payment pending forever.

## Consequences

A disabled account can still receive claims for payments made before it was
disabled. The payment screen still lists only enabled methods, so staff
cannot open the cash or bank tab of a method disabled since; the owner's
settlement still reaches the station.

## Enforced by

- `src/core/modules/station/station-config-actions.test.ts > a payment taken before the owner disabled its method > settles the bank transfer the owner confirmed`
- `src/core/modules/station/station-config-actions.test.ts > a payment taken before the owner disabled its method > settles the Lightning payment the owner received`
- `src/core/modules/station/station-config-actions.test.ts > a payment taken before the owner disabled its method > lets the station mark the cash it took paid`
- `src/core/background-jobs/jobs/station-lightning-watch-job.test.ts > station lightning watch job > still records an invoice paid after the owner disabled Bitcoin`
