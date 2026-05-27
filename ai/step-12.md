# Step 12 - Complete Activity, Payment Detail, and CSV Export

## Goal

Turn Activity into a usable payment history with filters, detail views, and CSV export.

## Scope

- Activity route.
- Payment filters.
- Payment detail.
- CSV export.

## Tasks

1. Replace placeholder activity feed with real payments.
2. Add filters for:
   - date range
   - payment method
   - payment status
   - table
3. Add a payment detail view containing:
   - internal payment ID
   - created timestamp
   - paid timestamp
   - fiat amount and currency
   - BTC sats
   - exchange rate and source
   - payment method
   - status
   - checkout ID
   - table name
   - tip amount
   - variable symbol
   - bank QR payload
   - Spark invoice
   - method technical data
4. Implement CSV export from domain data.
5. Decide and document CSV delimiter, decimal format, and timezone behavior.
6. Add tests for CSV escaping and required columns.

## Acceptance Criteria

- Payments created by cash, bank, and Spark flows appear in Activity.
- Filters can be combined.
- Payment detail exposes method-specific technical data.
- CSV export includes all required fields from the brief.
- CSV export works offline.

## Verification

Run:

```sh
bun test
bun run typecheck
bun run check
bun run build
```

Manual check:

- Create payments with at least two methods.
- Filter Activity by method and status.
- Open payment detail.
- Export CSV and inspect the columns.
