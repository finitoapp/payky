# Step 15 - MVP Hardening and Release Readiness

## Goal

Harden the MVP so it satisfies the brief's definition of done on mobile, offline, PWA, domain quality, and payment flow reliability.

## Scope

- End-to-end verification.
- Accessibility and responsive polish.
- Error states.
- Documentation updates.

## Tasks

1. Audit all user-facing text for translation keys in `en` and `cs`.
2. Audit all forms for Zod validation and translated errors.
3. Audit domain modules for browser, React, and infrastructure imports.
4. Audit adapters so Spark and Yadio are not used directly in UI or domain modules.
5. Verify offline support for:
   - app shell reload
   - catalog
   - tables
   - checkouts
   - cash payments
   - bank QR payments
   - Activity
   - CSV export
6. Verify online-only behavior for:
   - Yadio exchange rate fetching
   - Spark invoice creation
   - Spark payment observation
7. Add focused UI tests if the app already has a UI test runner; otherwise document manual smoke tests.
8. Check mobile portrait layout for overlapping text, unstable controls, and insufficient touch targets.
9. Update project documentation with:
   - setup
   - scripts
   - PWA behavior
   - offline behavior
   - known MVP limitations
   - open decisions from `ai.md`

## Acceptance Criteria

- The MVP definition of done from `ai.md` is either satisfied or each remaining gap is documented.
- `bun run build` succeeds.
- Domain unit tests cover the required business behavior.
- The app can be installed as a PWA.
- Supported offline flows work without network.
- Spark and Yadio failures have clear translated UI states.

## Verification

Run:

```sh
bun test
bun run typecheck
bun run check
bun run build
```

Manual check:

- Complete one cash payment.
- Complete one bank QR payment.
- Complete or simulate one Spark payment.
- Create, split, partially pay, and cancel a checkout.
- Export CSV.
- Install the PWA and repeat a smoke flow.
