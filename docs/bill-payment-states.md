# Bill and payment states

This document specifies the intended lifecycle of a `bill` and of a
`payment`, and how the two combine. It is the source of truth for *why* the
states are shaped this way, not just what the code currently does — read it
before changing `bill.status`, the bill's editing lock, `payment.canceledAt`/
`expiresAt`, or any of the guards in `bill-actions.ts` / `payment-actions.ts`
/ `reconciliation-claim-actions.ts`.

## Two independent verticals

A bill (the tab: line items, table, total) and a payment (one attempt to
collect money for a bill) are deliberately modeled as **two independent
state machines**, not one combined lifecycle:

- A bill can have zero, one, or many payments over its life (retries after a
  failed attempt, or several payments splitting one bill).
- A payment's own outcome (paid, canceled, expired) is meaningful on its own
  — e.g. for payment history — independently of what the bill it belongs to
  is doing.

They are read together to derive two extra facts: whether a bill is
currently **locked** for editing (a live payment is in flight — see
["Editing lock"](#editing-lock)), and whether a bill's total has been
**covered** by money that actually arrived (see
["Bill payment coverage"](#bill-payment-coverage)). Everything else about
each vertical is decided on its own.

## Payment vertical

### Stored fields

- `payment.canceledAt: timestamp | null` — set once, never cleared. Marks the
  payment as deliberately called off.
- `payment.expiresAt: timestamp | null` — set at creation time from the
  payment method's own expiry (e.g. a Lightning invoice's `expirySeconds`).
  `null` means the payment never expires on its own (cash, IBAN transfer —
  there is no natural "too late" for those; staff waits as long as it takes,
  or explicitly cancels — see ["Editing lock"](#editing-lock)).

No other payment status field exists. "Paid" is never written to the
`payment` row — it is read off the `reconciliationClaim` table instead (see
below), because a claim is a first-class fact (which account transaction
paid it, when, automatically or manually) that a boolean could not carry.

### Derived status

A payment's display status is computed at read time, in this precedence
order (first match wins):

| Priority | Status | Condition |
|---|---|---|
| 1 | **Canceled** | `canceledAt !== null` |
| 2 | **Paid** | an active (non-deleted) `reconciliationClaim` exists for this payment |
| 3 | **Expired** | `expiresAt !== null` and `now > expiresAt` |
| 4 | **Pending** | none of the above |

**Canceled outranks Paid on purpose.** `cancelPayment` itself refuses to
cancel a payment that already has an active claim (see next section), so in
the normal, single-device path this conflict cannot arise. But this is a
CRDT/local-first app: two devices can race — one cancels while another
records a claim for the same payment — and the merged result can end up with
both `canceledAt` and a claim set. Rather than trying to make that
impossible (it isn't, without a central lock), the model accepts it and
resolves it deterministically: the explicit human decision to cancel is
treated as authoritative for how the payment itself is *displayed*, so it
still shows as **Canceled**. The money that arrived anyway is not lost or
hidden — it still counts toward the bill's coverage sum below, which is
exactly what surfaces this edge case to staff (as an `overpaid` bill) instead
of silently discarding it.

**Paid outranks Expired.** A claim landing after the expiry window just means
the payment arrived late — the money is real regardless of the clock, so it
still counts as Paid.

**Pending** is the status that matters for locking a bill — see below.

### Guard

`cancelPayment` rejects a payment that already has an active
`reconciliationClaim` — a payment that has been paid cannot be canceled. As
described above, this guard prevents the conflict on a single device but
cannot prevent it across a concurrent multi-device merge — that residual case
is handled by the precedence rule, not by trying to make the guard airtight.

## Bill vertical

### Stored status

`bill.status` has exactly three values: **`open`**, **`closed`**,
**`canceled`**. Both `closed` and `canceled` are **final** — neither has any
transition back to `open` or to each other.

| Transition | Trigger | Guard |
|---|---|---|
| *(none)* → `open` | bill created (lazily, on the first cart line) | — |
| `open` → `closed` | a payment for this bill gains an active `reconciliationClaim` **and** the bill's resulting coverage is no longer `underpaid` (i.e. `paid` or `overpaid`) | only from `open` or an already-`closed` bill (idempotent); never from `canceled` — see `loadBillClosingAfterClaim` |
| `open` → `canceled` | the cart is discarded (trash icon on the bill page) | only from `open`; idempotent if called again on an already-`canceled` bill; does **not** check the editing lock — see below |
| `closed` → anything | never | rejected |
| `canceled` → anything | never | rejected |

Creating a *new* payment for a bill (`createPayment`) only requires the bill
to still be `open` — it does not by itself change `bill.status`, and it does
not check the editing lock below (see why in the next section). It rejects a
`canceled` or already-`closed` bill: once a bill is closed it is fully
settled and final, and a canceled bill was explicitly discarded before any
money was involved.

### Editing lock

Editing the bill's line items — the guard behind `addCatalogItemToBill`,
`addManualAmountToBill`, `addTipToBill`, `appendRemoveBillLine`, and
`splitBill` — requires more than `bill.status === "open"`. A bill is also
**locked** whenever it has a *live* payment attempt:

```
editable = bill.status === "open"
           AND no payment on this bill has derivePaymentStatus === "pending"
```

This is a **derived** condition — nothing is written to lock a bill.
`isBillLocked` recomputes it from the bill's payment rows every time a
cart-editing action is attempted. The moment every live payment for a bill
resolves (paid, canceled, or expires), the bill becomes editable again
automatically: there is no separate "unlock" action, and no way for a lock
to get stuck from a write that never landed, because no write ever created
it in the first place.

**Creating a new payment deliberately does not check this lock.** Since a
bill can have more than one payment (split payments), starting a second
payment attempt while another is still pending and unresolved is allowed.
Like every guard in this document, this is best-effort for the common
single-device path, not a proof: two devices can still race past it under
CRDT/multi-device concurrency. Any resulting overshoot is caught by the
coverage mechanism below, not prevented outright — see
`requireBillAcceptingPayment` vs. `requireEditableBill` in `bill-actions.ts`.

**The gap this closes.** A bill must stop accepting edits the moment a
payment attempt is genuinely in flight, not only once money has arrived —
otherwise nothing stops staff from changing the cart mid-payment while a
customer is looking at a QR code for a specific total, on a bill that
`bill.status` alone would still call `open`.

**The gap this leaves — and how it's closed.** The lock only clears itself
once the live payment resolves. Lightning has a natural resolution path via
`expiresAt`: an abandoned invoice expires on its own. Cash and IBAN have no
such expiry (`expiresAt` stays `null`) — so without an explicit cancellation,
a forgotten cash/IBAN attempt would lock its bill indefinitely. This is why
the payment-wait screen has a **"Cancel payment"** button, visible any time a
payment is not yet paid or canceled: it is the manual escape hatch that
makes the lock recoverable for every payment method, not only the ones with
an expiry.

### Bill closing happens atomically with the claim

Closing is folded into the *same mutation batch* as the write that confirms
the payment — the `reconciliationClaim` insert in
`claimManualReconciliation` (used by `markPaymentPaidCash`) and in
`reconcileAccountTransaction` (automatic bank/Spark matching), both in
`reconciliation-claim-actions.ts`. Both compose `loadBillClosingAfterClaim`
(bill module — computes whether closing applies, without writing anything)
with `upsertBillClosedRow` (bill module — a plain upsert taking the caller's
`MutationOptions`) to fold the write into their own batch. This is the same
load/compute-Task-plus-plain-upsert-function pattern used elsewhere in this
codebase for cross-module writes (see `payment-number-actions.ts`), and it
means the closing write can never happen as a separate, independently
failable step after the claim.

Both entry points share one helper, `writeClaimAndCloseBillIfCovered`, which
also re-checks coverage once more immediately after its own batch commits
and folds in a closing write then if warranted. This narrows — but, under
CRDT/multi-device concurrency, cannot fully eliminate — the window where two
payments on the same split bill are confirmed at nearly the same time and
each computes "still underpaid" from a pre-write snapshot that doesn't yet
include the other's claim. It also preserves the bill's original `closedAt`
across any later re-close instead of overwriting it with the new claim's
time.

## Bill payment coverage

Independent of `bill.status`, a bill's payments are compared against its
line-item total to answer "has this bill actually been paid for":

```
claimedSum = Σ (payment.amount − payment.tipAmount)
             over every payment with payment.billId = bill.id
             that has an active reconciliationClaim
             — regardless of that payment's own canceled/expired display status

billTotal = sum of the bill's line-item summaries (bill-line ledger, "add" − "remove")
```

`payment.tipAmount` is subtracted because `payment.amount` already includes
the tip on top of what was charged for the bill's items (see
`calculatePaymentAmounts`) — a tip is gratuity, not part of what the bill's
line items are worth, and must not skew the comparison.

| Coverage | Condition |
|---|---|
| **paid** | `claimedSum == billTotal` (a bill with `billTotal == 0`, e.g. fully discounted, is trivially `paid` with zero payments) |
| **underpaid** | `claimedSum < billTotal` (includes the common case of no claimed payment at all, `claimedSum == 0`) |
| **overpaid** | `claimedSum > billTotal` |

This is computed purely from data, with no stored field, and applies
regardless of `bill.status`. `bill.status` transitions to `closed` precisely
when this stops being `underpaid` (see the transition table above) — so a
`closed` bill is always `paid` or `overpaid`, never `underpaid`, by
construction.

## Reading the combination

| `bill.status` | coverage | editable? | Meaning |
|---|---|---|---|
| `open` | underpaid (0) | yes | ordinary cart, nothing charged yet |
| `open` | underpaid | **no** (locked) | checkout in progress — a live payment is pending |
| `open` | underpaid (>0) | yes | a split/partial payment was confirmed but didn't cover the total, and nothing is currently pending — bill stays open for the rest |
| `closed` | paid | — (final) | fully settled — the expected happy path |
| `closed` | overpaid | — (final) | more money confirmed than the bill was worth — a legitimate split-payment overshoot, **or** the canceled-but-claimed race described in the payment vertical; needs a human to look at it |
| `canceled` | underpaid (0) | — (final) | ordinary discarded cart, no payment was ever involved |
| `canceled` | paid or overpaid | — (final) | a bill was discarded while a payment was still pending, and that payment was confirmed anyway — see below |

There is no bill-level stored state for "awaiting payment" — it is exactly
the `open` + locked row above, read from the two verticals together.
`closed` + `underpaid` never occurs, by construction of the closing
transition.

**`canceled` + `paid`/`overpaid` is reachable through ordinary, single-device
use, not only a multi-device race.** `cancelBill` only checks `bill.status`
(via `requireCancelableBill`) — unlike `createPayment`, it does **not**
consult the editing lock. So `open` with a pending payment → `canceled` is
an allowed transition: staff can discard a cart while a payment is still
in flight (the bill page's own UI makes this hard to trigger by hiding the
cart behind the "locked" message once a payment is pending, but the domain
guard doesn't forbid it). If that payment is confirmed afterward,
`loadBillClosingAfterClaim`'s `requireClosableBill` check excludes
`canceled` bills, so the claim still counts toward coverage but the bill
is never forced out of `canceled` — see "the editing lock rejects..." and
"canceling a bill with a pending payment..." in `payment-actions.test.ts`.

## Non-goals / explicitly out of scope

- No automatic reopening of a `closed` or `canceled` bill back to `open`,
  ever, under any combination of payment outcomes.
- No automatic refund or reconciliation action when a bill is found
  `overpaid` — it is surfaced to staff visually; resolving it is a manual,
  out-of-band process.
- No enforcement that stops a bill from accumulating more than one
  concurrent payment attempt — multiple payments per bill (split payments)
  are an intended capability, not a bug to guard against, and creating a new
  payment deliberately does not check the editing lock.
- No live, wall-clock-driven re-render of the editing lock in the UI purely
  from time passing (e.g. a Lightning invoice crossing `expiresAt` with no
  other data change). The lock is recomputed reactively whenever the
  underlying payment/claim rows change, and freshly on every guarded write —
  it is not guaranteed to visually flip the instant a timer elapses with
  nothing else happening on screen.
