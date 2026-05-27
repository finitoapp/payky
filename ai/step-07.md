# Step 07 - Build the POS App Shell and Navigation

## Goal

Turn the current prototype into a merchant POS shell with the main routes from the brief, while keeping each screen functional even if some features are still mocked.

## Scope

- Layout and navigation.
- Route structure.
- Mobile-first POS ergonomics.

## Tasks

1. Ensure these routes exist and are linked:
   - Main
   - Checkouts
   - Activity
   - Settings
2. Update the root layout for mobile POS usage:
   - compact header
   - touch-friendly navigation
   - portrait-friendly spacing
3. Add translated navigation labels for all routes.
4. Keep screens accessible from desktop and mobile widths.
5. Avoid marketing-page layout; the first screen must be the usable POS experience.
6. Keep UI components local under `src/components/ui`.

## Acceptance Criteria

- All four primary routes load without errors.
- Navigation works with TanStack Router.
- The first route is the POS Main screen, not a landing page.
- User-facing text is translated in `en` and `cs`.
- The app remains buildable and type-safe.

## Verification

Run:

```sh
bun run typecheck
bun run check
bun run build
```

Manual check:

- Visit `/`, `/checkouts`, `/activity`, and `/settings`.
- Test route navigation on a narrow viewport.
