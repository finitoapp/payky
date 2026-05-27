# Agent Guide

## Project Rules

- Write all code, comments, commit messages, and documentation in English.
- Use Bun for dependency management and scripts. Keep `exact = true` in both Bun config files.
- Keep the app TypeScript-first and preserve strict compiler settings.
- Use shadcn-style local UI components in `src/components/ui`; primitives must come from Base UI.
- Use Zod for form, domain, and Evolu schema validation.
- Store persistent application data through Evolu. Avoid direct `localStorage` except for non-critical UI preferences such as language.
- Use Biome for linting and formatting.
- Do not create or use `index.ts` barrel files for re-exporting. Import directly from the owning module file.

## Project Structure

- `src/main.tsx` is the browser entry point. It creates the Evolu client and renders the React app.
- `src/App.tsx` wires top-level providers and the TanStack Router provider.
- `src/router.tsx` creates the TanStack Router from `src/routeTree.gen.ts`; route files live in `src/routes`.
- `src/routes/__root.tsx` connects the generated root route to `RootLayout` from `src/pages.tsx`.
- `src/routes/index.tsx` and `src/routes/activity.tsx` define file-based routes. Keep route files thin and move substantial page UI into page or feature modules.
- `src/pages.tsx` currently contains the root layout and simple page components. When pages grow, prefer extracting feature-specific components instead of expanding this file indefinitely.
- `src/components/ui` contains shadcn-style reusable UI primitives built on Base UI, such as `button.tsx` and `button-variants.ts`. Keep generic UI here; avoid feature or domain logic in this directory.
- `src/components/theme-provider.tsx` contains theme-level UI infrastructure.
- `src/providers/evolu.tsx` creates and exports the typed Evolu React binding hooks and composes app providers.
- `src/core/evolu` contains Evolu client setup and the app schema composition. Register new Evolu tables and indexes in `src/core/evolu/schema.ts`.
- `src/core/modules` contains domain modules. Each module owns its schema, branded ids/types, actions, queries, and tests for one domain concept.
- `src/core/modules/shared` contains lower-level domain helpers, shared schemas, Evolu dependency helpers, and shared action error utilities.
- `src/i18n` contains translation resources and the translation hook. All user-facing React text must use keys from `src/i18n/resources.ts`.
- `src/lib` contains app-level generic utilities such as `cn`; keep domain code in `src/core/modules` instead.
- `src/assets` contains static frontend assets.
- `src/index.css` contains global Tailwind and theme styles.
- `src/zod-utils.ts` contains app-level Zod helpers that are not specific to one domain module.

## Domain Module Structure

- Use `*-types.ts` for branded ids, domain enums/unions, and exported domain types.
- Use the module root file, for example `payment.ts`, for Evolu table schemas, detail/extension table schemas, indexes, and `InferTable` row exports.
- Use `*-actions.ts` for Evolu mutations and command-style domain operations. Expected domain failures should return `Result`.
- Use `*-queries.ts` for reusable Evolu queries and read models.
- Use `*-utils.ts` for pure domain helpers that are not tied to Evolu mutation execution.
- Keep tests beside the module they cover as `*.test.ts`.
- For aggregate detail tables sharing the root id, keep root and detail table ownership in the same module unless another module clearly owns a separate lifecycle.

## Translation Key Rules

- Never hardcode user-facing text in React components.
- Add every visible label to `src/i18n/resources.ts` for both `en` and `cs`.
- Use dot-separated, feature-scoped keys, for example `pay.request`, `settings.language`, or `activity.empty`.
- Do not rename existing translation keys without updating every usage.
- Prefer stable semantic keys over text-derived keys; key names should describe purpose, not exact copy.

## TypeScript Rules:


- Prefer immutability by default:
    - Use `const` unless reassignment is required.
    - Prefer `readonly` fields and `Readonly<...>`/`ReadonlyArray<...>` for read-only data.
    - Return new objects/arrays instead of mutating existing values unless mutation is required by a local API.
- Use Result-based error handling for expected failures:
    - Import `Result`, `ok`, and `err` from the `@evolu/common` module.
    - Reserve thrown exceptions for programmer errors, unexpected infrastructure failures, framework boundaries, and established local patterns.
- Prefer `unknown` over `any`:
    - Use `unknown` at untrusted boundaries, then narrow with zod, type guards, or explicit checks.
    - Avoid introducing new `any`. If legacy generic helpers force `any`, keep it local and do not widen public types.
- Prefer `interface` for object shapes.
    - Use `type` for unions, intersections/compositions, mapped or conditional types, function aliases, branded types, and `z.output<...>` aliases.
- Prefer `ReadonlyArray<T>` over `T[]` for inputs and read-only collections.
    - Use `T[]` when code intentionally mutates the array, an external/local API requires a mutable array, or a builder/ORM pattern expects mutation.
- Type empty array declarations explicitly.
    - Use `const rows: Row[] = []` or `const rows = [] as Row[]` instead of relying on inference for an empty array.
- Avoid non-null assertions (`!`):
    - Prefer explicit guards, Result errors, zod validation, or control-flow narrowing.
    - Use `!` only when an established framework pattern makes a guard impossible or materially worse, and keep the scope narrow.
    - `noUncheckedIndexedAccess` is enabled, so guard indexed values (`array[index]`, record lookups) with explicit checks, schema parsing, or local assertion helpers rather than adding `!`.
- Avoid mutable parameters:
    - Do not mutate object or array parameters unless the function is explicitly a mutator and the name/signature makes that clear.
    - Prefer returning updated values or passing explicit mutable collaborators such as builders, entity managers, or transactions.
- Avoid circular dependencies:
    - Use type-only imports (`import type`) for types.
    - Keep shared types/helpers in lower-level modules when that matches nearby structure.
    - Do not create barrels or convenience imports that introduce cycles.
- Use utility types from `type-fest` where they clarify intent or match local usage:
    - Common examples in this repo include `ValueOf`, `Simplify`, `ExactObject`, `EmptyObject`, `JsonObject`, `JsonValue`, `Replace`, `Get`, and `DistributedPick`.
    - Do not add a new custom utility type when `type-fest` already provides a clear equivalent.
- Prefer `async`/`await` over `Promise.then(...)` chains.
    - Keep promise combinators such as `Promise.all` when they express concurrency clearly.
    - Keep `Promise.all([...])` tuples reasonably short; if the list grows past 10 items, split it into coherent groups or use another typed pattern.
- Import and use `BigNumber` deliberately.
- Preserve exhaustive typing for finite variants.
    - Use `assert-never` or the established nearby exhaustive-check pattern for switches or branches over unions/enums.
    - Use `satisfies Record<EnumOrUnion, ...>` for enum/union-keyed maps when completeness should be enforced while preserving literal value types.
- Prefer named exports.
    - Avoid new default exports unless the nearby module family already uses them or a framework requires them, such as Storybook stories or existing framework interop helpers.

## Architecture Rules

- Define action input object types inline in function parameters; avoid separate `CreateXInput` or `UpdateXInput` aliases.
- For aggregate extension/detail tables sharing the root id, soft delete only the root row unless the detail has its own lifecycle.
- For CRDT actions, write tombstones and updates directly without preloading rows, unless current data is required for a domain invariant.
- Pass Evolu mutation payloads through `removeUndefinedValues` to avoid extra or undefined fields.
