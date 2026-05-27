# Step 08 - Implement Main POS Calculator and Cash Flow

## Goal

Deliver the first complete payment path: a mobile-first POS calculator that can create and complete cash payments.

## Scope

- Main POS screen.
- Cash payment flow.
- Tip selection.
- Optional checkout association.

## Tasks

1. Replace the overview-style home page with a POS calculator.
2. Allow fiat amount entry with large touch targets.
3. Show current fiat currency.
4. Show payment method tabs ordered by settings.
5. Add tip controls:
   - percentage presets
   - fixed presets
   - custom amount
   - disabled state when tips are disabled
6. Allow selecting an open checkout or no checkout.
7. Create a cash payment.
8. Mark cash payments as `paid` immediately after confirmation.
9. Update checkout paid/due totals when the payment belongs to a checkout.
10. Add translated labels and empty states.

## Acceptance Criteria

- A merchant can create a standalone cash payment from the Main screen.
- A merchant can create a cash payment for an existing checkout.
- Cash payment appears in Activity.
- Checkout status becomes `partially_paid` or `paid` based on totals.
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

- Create a cash payment without a checkout.
- Create a cash payment for a checkout.
- Confirm Activity and checkout totals reflect both payments.
