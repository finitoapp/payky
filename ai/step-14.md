# Step 14 - Replace Prototype State With Evolu Data Flow

## Goal

Remove the in-memory prototype as the source of truth and run the application from Evolu-backed local-first data.

## Scope

- App state provider migration.
- Repository-backed reads and writes.
- Offline persistence validation.

## Tasks

1. Replace in-memory arrays in app state with Evolu queries.
2. Replace direct React state mutations with repository/use-case calls.
3. Preserve optimistic or immediate local updates where Evolu supports them.
4. Seed demo data only through an explicit development path, not production startup.
5. Ensure all domain writes go through repository adapters.
6. Ensure all expected write failures return user-visible translated errors.
7. Remove obsolete in-memory helpers after feature parity is verified.
8. Audit the codebase for direct domain `localStorage` usage and remove it.

## Acceptance Criteria

- App data survives reloads.
- App data survives offline usage.
- Cash, bank QR, checkouts, catalog, tables, Activity, CSV export, settings, and tips use Evolu data.
- No domain data is stored in `localStorage`.
- App still works in a normal browser tab and as installed PWA.

## Verification

Run:

```sh
bun test
bun run typecheck
bun run check
bun run build
```

Manual check:

- Create catalog items, tables, checkouts, and payments.
- Reload the browser.
- Turn offline mode on.
- Create cash and bank payments.
- Reload again and confirm data remains available.
