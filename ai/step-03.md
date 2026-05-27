# Step 03 - Add Form Foundation With TanStack Form and Zod

## Goal

Create the app form foundation so settings, catalog, tables, checkout edits, and payment creation can use the same validation pattern.

## Scope

- Form helper utilities.
- Zod validation integration.
- First migrated low-risk form.

## Tasks

1. Add a small form helper module for TanStack Form and Zod integration.
2. Define input schemas for:
   - item creation and editing
   - table creation and editing
   - manual checkout amount
   - tip amount
   - bank settings
   - payment number series settings
3. Migrate one small existing form or add one minimal form in Settings to prove the pattern.
4. Add shared UI form primitives in `src/components/ui` using Base UI primitives where needed.
5. Add translations for all visible form labels, descriptions, validation messages, and buttons.

## Acceptance Criteria

- The migrated form validates via Zod.
- Validation errors are visible and translated in `en` and `cs`.
- No React component hardcodes user-facing text.
- Form helpers are reusable by later steps.
- Existing screens remain usable.

## Verification

Run:

```sh
bun run typecheck
bun run check
bun test
bun run build
```

Manual check:

- Submit the migrated form with invalid input.
- Confirm translated validation feedback appears.
- Submit valid input and confirm state updates.
