# Step 06 - Harden Domain Schemas and Use-Cases

## Goal

Move core POS behavior into browser-independent domain use-cases with Zod as the validation boundary.

## Scope

- Domain services and use-cases.
- Unit tests.
- Minimal UI wiring only where needed to keep the app working.

## Tasks

1. Split domain logic into use-case modules for:
   - items
   - tables
   - checkouts
   - payments
   - settings
   - export
2. Add Zod input schemas for every public use-case.
3. Return `Result` for expected validation and business failures.
4. Add exhaustive handling for finite variants with `assert-never` or the existing local pattern.
5. Cover these flows with Bun unit tests:
   - create, update, and soft-delete item
   - create, update, and soft-delete table
   - create checkout
   - assign and remove checkout table
   - add catalog item
   - add manual amount
   - add tip
   - remove checkout item
   - split checkout
   - cancel checkout
   - partial payment status update
6. Keep React components as consumers of use-cases, not owners of business rules.

## Acceptance Criteria

- Domain tests run in Bun without a browser.
- Business modules do not import React, DOM, PWA, or localStorage APIs.
- Existing UI flows still work through the new use-case layer.
- TypeScript strict settings remain unchanged.

## Verification

Run:

```sh
bun test tests/domain
bun run typecheck
bun run check
bun run build
```

Manual check:

- Create or edit a checkout in the UI.
- Confirm totals and statuses still update correctly.
