# Step 11 - Complete Checkouts Management

## Goal

Make Checkouts a complete working screen for open bills, tables, catalog items, manual amounts, tips, split bills, partial payments, and cancellation.

## Scope

- Checkouts route.
- Checkout item operations.
- Table assignment.
- Partial payment entry point.

## Tasks

1. List open, partially paid, paid, and canceled checkouts with filters or clear grouping.
2. Create a checkout with or without a table.
3. Assign, move, or remove a checkout table.
4. Add catalog items to a checkout.
5. Add manually entered amount rows.
6. Add tip rows.
7. Remove checkout items.
8. Show total, paid, and due amount.
9. Split a checkout into a new checkout.
10. Start a payment for the due amount from a checkout.
11. Support partial payment by allowing a payment amount lower than due.
12. Cancel an open or partially paid checkout with a confirmation step.

## Acceptance Criteria

- Multiple open checkouts can exist at once.
- Multiple checkouts can be assigned to one table.
- Checkout can remain without a table.
- Partial payments update due amount and status.
- Split checkout creates a second valid checkout and preserves totals.
- All visible text is translated.

## Verification

Run:

```sh
bun test
bun run typecheck
bun run check
bun run build
```

Manual check:

- Create two checkouts for one table.
- Add catalog and manual items.
- Split one checkout.
- Partially pay a checkout.
- Cancel a checkout.
