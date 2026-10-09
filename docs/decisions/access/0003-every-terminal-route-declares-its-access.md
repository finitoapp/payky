# 0003 Every terminal route declares its access

Status: accepted
Date: 2026-10-08

## Context

A screen added without a gate would ship unlocked by omission. TanStack
Router also runs `beforeLoad` and `loader` of every matched route before
any component renders, so a gate in a component cannot stop them.

## Decision

- Every route under `_terminal` declares `staticData.access`: a permission,
  or `free`. Layout routes declare too. The gate in the `_terminal` layout
  checks every matched route, not only the deepest, so a permission on a
  layout locks all of its children; a layout with a `free` child is `free`.
- No `_terminal` route has a `loader`, and a `beforeLoad` there only
  validates search params and redirects (`_terminal.bill.tsx`).
- A unit test over the route tree fails on a route that declares nothing,
  on a `free` route under a layout with a permission, and on a `loader`.

## Alternatives considered

A permission only on leaf routes: a layout's own UI would then be open, and
a new child would inherit nothing.

## Consequences

Routes outside `_terminal` (`/onboarding`, `/restore-account`) are not
gated; account/0005 keeps them from touching an account they were not asked
to.

## Enforced by

- `src/router.test.ts > _terminal route access (access/0003) > every route declares a permission or free, layouts included`
- `src/router.test.ts > _terminal route access (access/0003) > no free route sits under a layout that declares a permission`
- `src/router.test.ts > _terminal route access (access/0003) > no route has a loader, which would run before the gate`
