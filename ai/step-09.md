# Step 09 - Implement Bank QR Payments

## Goal

Deliver the Czech bank QR payment flow with deterministic variable symbol generation and manual confirmation.

## Scope

- Bank payment creation.
- SPD payload generation.
- QR display.
- Manual status updates.
- Unit tests for payment number series and SPD payload behavior.

## Tasks

1. Validate that bank payments are available only for `CZK`.
2. Require a configured merchant IBAN before creating a bank payment.
3. Generate the next variable symbol atomically with payment creation.
4. Create an SPD payload containing:
   - IBAN
   - amount
   - currency
   - variable symbol
5. Render the SPD payload as a QR code.
6. Let the merchant mark the payment as `paid` or `canceled`.
7. Store technical payment data needed by Activity detail and CSV export.
8. Add unit tests for:
   - variable symbol date reset
   - prefix behavior
   - serial padding
   - CZK-only guard
   - missing IBAN guard
   - SPD payload generation

## Acceptance Criteria

- Bank payment creation works offline.
- Bank payment cannot be created for `EUR` or `USD`.
- Bank payment cannot be created without IBAN.
- Variable symbol increments deterministically.
- Manual paid/canceled status updates are reflected in Activity and checkout totals.

## Verification

Run:

```sh
bun test tests/domain
bun run typecheck
bun run check
bun run build
```

Manual check:

- Set currency to `CZK` and IBAN in Settings.
- Create a bank QR payment.
- Mark it paid.
- Switch currency to `EUR` and confirm bank payment is unavailable with translated messaging.
