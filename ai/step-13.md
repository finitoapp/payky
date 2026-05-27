# Step 13 - Complete Settings

## Goal

Make Settings the control center for merchant configuration, payment methods, catalog, tables, tips, language, theme, and seed information.

## Scope

- Settings route.
- Forms and persistence.
- Preference storage exceptions.

## Tasks

1. Add payment method ordering controls.
2. Add fiat currency selection:
   - `CZK`
   - `EUR`
   - `USD`
3. Add catalog item management:
   - create
   - edit
   - soft delete
4. Add table management:
   - create
   - edit
   - soft delete
5. Add tips settings:
   - enabled/disabled
   - percentage presets
   - fixed amount presets
6. Add bank settings:
   - IBAN
   - variable symbol series
   - last number display or controlled reset if explicitly designed
7. Add Spark/Evolu seed information:
   - read-only security explanation
   - export confirmation
   - warning before revealing mnemonic or seed material
8. Add language selection.
9. Add theme selection:
   - light
   - dark
   - system
10. Add About section with app version and GitHub repository link.

## Acceptance Criteria

- Domain settings persist through Evolu.
- Only language and theme may use browser preference storage.
- All forms validate through Zod.
- Payment method order changes Main screen tabs.
- Currency changes are reflected in Main, Checkouts, Activity, and Settings.
- Bank QR method is unavailable outside `CZK`.
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

- Reorder payment methods and verify Main screen tab order.
- Add an item and use it in a checkout.
- Add a table and assign it to a checkout.
- Change language and theme, then reload.
