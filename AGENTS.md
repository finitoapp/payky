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
- For asynchronous reads from remote or native APIs in React, use TanStack Query's `useQuery` rather than `useEffect` with local state. Use a stable `queryKey` and `enabled` for runtime or input preconditions; keep Evolu subscriptions on `useEvoluQuery`.

## Project Structure

- `src/main.tsx` is the browser entry point. It installs polyfills and renders the React app.
- `src/App.tsx` wires top-level providers (Jotai store, theme, background jobs, toaster) and the TanStack Router provider.
- `src/router.tsx` creates the TanStack Router from `src/routeTree.gen.ts`; route files live in `src/routes`.
- `src/routes/__root.tsx` defines the root layout and error boundary; `src/routes/_terminal.tsx` is the layout route for the terminal pages. Keep route files thin and move substantial page UI into page or feature modules.
- `src/atoms` contains Jotai atoms that bootstrap app singletons: the device Evolu client, the app Evolu client, the active account, console, and run. Evolu clients are created here, not in `main.tsx`.
- `src/hooks` contains the React bindings for those singletons (`useEvolu`, `useEvoluQuery`, `useDeviceEvoluQuery`, `useConsole`, `useTranslation`, `useAppRun`, ...). Access Evolu from React through these hooks.
- `src/features` contains feature modules: page-level UI (forms, hooks, presentational components) for one feature, composed from domain modules and `src/components/ui` primitives. `src/features/settings` is the first tenant. Substantial page UI extracted from routes belongs here, not in `src/routes` or `src/components`.
- `src/components/ui` contains shadcn-style reusable UI primitives built on Base UI, such as `button.tsx`. Keep generic UI here; avoid feature or domain logic in this directory.
- `src/components/theme-provider.tsx` contains theme-level UI infrastructure.
- `src/core/evolu` contains Evolu client setup, the app schema composition, and the device database (`device-client.ts`, `device-account.ts`). Register new Evolu tables and indexes in `src/core/evolu/schema.ts`.
- `src/core/modules` contains domain modules. Each module owns its schema, branded ids/types, actions, queries, and tests for one domain concept.
- `src/core/modules/shared` contains lower-level domain helpers, shared schemas, Evolu dependency helpers, and the `getFirstOr` Result helper.
- `src/core/deps.ts` declares small injectable dependency objects (`FetchDep`, `DateDep`, `EvoluOwnerIdDep`); `src/core/error.ts` provides the `defineError` factory.
- `src/core/background-jobs` contains the background job framework (`BackgroundJobContext`, keyed task queue) and the sync jobs under `jobs/`. Jobs receive all effects — including `lockManager` — through their context; never use ambient globals such as `navigator.locks`.
- `src/core/integrations` contains HTTP clients for external services (FIO, Yadio, LNURL). Clients follow the fio convention: a `createXApiDep` factory, HTTP through `appFetchAsJson` from `src/core/deps.ts`, zod-validated responses, and `defineError` errors carrying `status` and `responseBody`.
- `src/core/spark` wraps the Spark wallet SDK behind `SparkWalletDep`. Do not call `SparkWallet.initialize`/`getOrCreateWallet` directly outside this wrapper; extend the wrapper when a consumer needs more of the SDK surface. Instances are shared per mnemonic and ref-counted (via the internal `createRefCountedResourcePool` in `src/lib/ref-counted-resource-pool.ts`, exposed through `createSharedSparkSyncWallet` and `createDefaultSparkPaymentWallet`): each caller still owns cleanup of its own `sparkWallet.create()` result exactly like any other disposable, but the underlying SDK instance is only actually torn down once every concurrent holder — including the Spark account sync job's long-held reference — has released it, so a warm instance survives back-to-back calls for the same account.
- `src/core/cli` contains CLI-runtime helpers (`cli-env.ts`, the in-process lock manager); CLI entry points live in `bin/`.
- `src/core/native` contains Capacitor/WebView runtime detection and platform plumbing.
- `src/i18n` contains translation resources and the translation hook. `src/i18n/en.ts` is the source of truth for translation keys; `cs.ts` and `sk.ts` must cover every key via `satisfies Record<TranslationKey, string>`, and `resources.ts` only composes the languages.
- `src/lib` contains app-level generic utilities such as `cn`; keep domain code in `src/core/modules` instead.
- `src/assets` contains static frontend assets.
- `src/index.css` contains global Tailwind and theme styles.
- `src/zod-utils.ts` contains app-level Zod helpers that are not specific to one domain module.
- `e2e` contains Playwright end-to-end tests (`playwright.config.ts` at the repo root). See "E2E Testing" below for conventions.

## Domain Module Structure

- Use `*-types.ts` for branded ids, domain enums/unions, and exported domain types.
- Use the module root file, for example `payment.ts`, for Evolu table schemas, detail/extension table schemas, indexes, and `InferTable` row exports.
- Use `*-actions.ts` for Evolu mutations and command-style domain operations. Expected domain failures should return `Result`.
- Use `*-queries.ts` for reusable Evolu queries and read models.
- Use `*-utils.ts` for pure domain helpers that are not tied to Evolu mutation execution.
- Keep tests beside the module they cover as `*.test.ts`.
- For aggregate detail tables sharing the root id, keep root and detail table ownership in the same module unless another module clearly owns a separate lifecycle.
- An actions file writes only to tables its own module owns. To write another module's table, compose that module's Task instead of upserting directly, as `bill-actions.ts` does with `bill-line` and `item` actions.

## Domain Action Patterns

- Write every action as an Evolu `Task<T, E, D>` from `@evolu/common` and access dependencies through `run.deps`, as in `payment-actions.ts`. Simple Evolu-only actions typically need `EvoluDep & EvoluOwnerIdDep`. (The legacy curried `(deps) => async (...)` style has been fully removed; do not reintroduce it.)
- In React, obtain runs through `useAppRun()` from `src/hooks/use-app-run.ts`: `const appRun = useAppRun()` then `await using run = appRun()` inside handlers. Do not call `createRun` directly in components; the only sanctioned exception is `app-background-jobs.tsx`, which additionally needs `lockManager` and `onError`.
- Inside an `await using run = appRun()` scope, always `await` calls to `run(...)`/`run.orThrow(...)` before returning — never `return run.orThrow(...)` bare. `await using` disposes `run` as soon as the enclosing function's synchronous execution finishes, so returning the promise unawaited disposes `run` before the task actually completes.
- Express Task dependencies as intersections of small dependency objects, for example `EvoluDep & SparkWalletDep & FetchDep`.
- In tests, create a concrete deps object with fakes for external services and run Task actions with `await using run = testCreateRun(deps)` followed by `await run(action(...))`.
- When a Task calls another Task, compose it with `await run(otherTask(...))` and propagate non-ok results directly when the error type is part of the caller's error union.
- Keep direct dependency calls for non-Task services, for example `run.deps.evolu.loadQuery(...)` or `run.deps.sparkWallet.create(...)`.
- When code must wait for an Evolu mutation to complete before running follow-up work, use `runMutationWithCompletion` from `src/core/modules/shared/utils.ts` instead of hand-rolled `onComplete` promises.
- Minimize the number of `runMutationWithCompletion` batches a Task performs where possible: prefer folding related upserts into one shared batch over several sequential ones, since each batch is an extra awaited round trip and a window where a partial write could be observed. When composing another module's write logic into your own batch, split that module's exports into a load/compute Task (no upsert) and a plain upsert function taking the caller's `MutationOptions`, as `payment-number-actions.ts`'s `loadNextPaymentNumber`/`upsertPaymentNumberRows` do for `createPayment`, instead of calling a Task that always opens its own separate batch.
- In Task code, use `run.deps.console` for all logging. Do not call global `console.log`, `console.warn`, `console.error`, or related console methods directly.
- Clean up disposable resources acquired inside Task actions with `await using`, as with wallet cleanup in `createPreparedPayment`.
- Define domain errors with `defineError` from `src/core/error.ts` and export their types via `ReturnType`, for example `const createPaymentNotFoundError = defineError("PaymentNotFound")<{ readonly id: PaymentId }>()` with `export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>`. Type each Task's `E` as the union of its expected errors.
- Return `err(createXNotFoundError({ id }))` for missing domain rows or required related records instead of throwing. Use `getFirstOr(rows, error)` from `src/core/modules/shared/result.ts` to turn a load-first query into a `Result`.
- Keep thrown exceptions for programmer errors, schema decode failures, framework boundaries, or established local patterns.

## Translation Key Rules

- Never hardcode user-facing text in React components.
- Add every visible label to `src/i18n/en.ts` and translate it in `cs.ts` and `sk.ts`; the `satisfies Record<TranslationKey, string>` checks enforce full coverage.
- Use `t(key, params)` with `{name}`-style placeholders for dynamic values instead of string concatenation.
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
- Use strict equality checks only:
    - Do not use loose equality or inequality (`==` or `!=`), including nullish checks such as `value == null`.
    - Compare explicitly with `===` and `!==`, for example `value === undefined`, `value !== null`, or both checks when both nullish values are possible.
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

## E2E Testing

- Run tests with `bun run test:e2e` (headless, dev server) or `test:e2e:ui` (interactive). `bun run test:e2e:preview` runs the same suite against a one-off production build instead: `PAYKY_E2E_BUILD=1 vite build` once, then Playwright's `webServer` runs `vite preview` (set via `PAYKY_E2E_SERVER=preview`, read in `playwright.config.ts`) rather than `bun run dev`. Tests live in `e2e/*.spec.ts`; `playwright.config.ts` at the repo root configures a single `chromium` project.
- The Playwright `webServer` boots the real Vite dev server (or, for `test:e2e:preview`, `vite preview` serving a real build) with basic-SSL left enabled (never set `PAYKY_DISABLE_BASIC_SSL` for e2e) so tests run over HTTPS with a self-signed cert (`ignoreHTTPSErrors` in the config), the same way production TLS behaves — `@vitejs/plugin-basic-ssl` applies to both `server.https` and `preview.https`. Some browser features (for example `navigator.clipboard`) are unavailable under plain HTTP, so testing over HTTP would hide regressions in those code paths.
- Evolu/SQLite persists through OPFS (Origin Private File System) in Chromium, not IndexedDB — Playwright's `storageState({ indexedDB: true })` snapshot/restore does **not** capture it, so pre-seeding an onboarded account via storageState does not work here. Don't reintroduce that approach.
- `src/components/e2e-test-bridge.tsx` (mounted in `App.tsx`) exposes `window.__e2eSeedOnboarding`, which calls the same production Task actions the onboarding UI does (`saveCashRegisterAccount`, `saveSparkAccount`, `saveFiatBankAccount`, `completeOnboarding`) directly, skipping the onboarding UI. It's gated on `import.meta.env.DEV || __E2E_TEST_BUILD__`, **not** `import.meta.env.DEV` alone — that define is `false` in every `vite build` output regardless of how it's later served, so DEV alone would make the bridge dead code in the `test:e2e:preview` build too. `__E2E_TEST_BUILD__` is a `vite.config.ts` `define` wired to `PAYKY_E2E_BUILD=1`, set only by `test:e2e:preview`'s build step — a real production build never sets it, so the bridge stays dead code (removed) there. `e2e/fixtures.ts`'s `seedOnboarding`/`seedCurrentAccountOnboarding` call the bridge via `page.evaluate` and wait for the app's own reactive redirect off `/onboarding`. Use this in specs that don't test onboarding itself; `completeOnboarding()` (real UI clicks) remains for specs that do (`e2e/onboarding.spec.ts`, `e2e/smoke.spec.ts`) and for a second device account created mid-test (see below).
- Switching the active device account recreates the app's Evolu client, and `E2eTestBridge`'s effect doesn't reliably reattach `window.__e2eSeedOnboarding` to the new client in time — use `completeOnboardingDefaults()` (real UI clicks) for a second account instead of the seed bridge, as `e2e/settings-accounts.spec.ts` does.
- `e2e/fixtures.ts` holds reusable flow helpers (`completeOnboarding`, `completeOnboardingDefaults`, `seedOnboarding`, `seedCurrentAccountOnboarding`, `enterAmount`, `createPayment`, `markCashPaid`, `translate`, `translateValue`, `gotoPage`, `reloadPage`, `pageWidth`/`pageHeight`) plus a `test`/`expect` re-export extended with a `seededPage` fixture. It is imported both by `*.spec.ts` files and by `bin/generate-doc-screenshots.ts`, which drives a manually launched `chromium.launch()` browser outside the Playwright test runner. Because of that second consumer, functions in `e2e/fixtures.ts` must never call `test.step(...)` (or other APIs that require an active test) — they throw `test.step() can only be called from a test` outside a real test run. Extend `e2e/fixtures.ts` instead of duplicating flow steps in a spec file or in the screenshot script, but keep it runner-agnostic.
- Import `test`/`expect` from `./fixtures.ts`, not `@playwright/test`, in every spec except `e2e/onboarding.spec.ts` and `e2e/smoke.spec.ts` (which test onboarding itself and must not auto-seed). Destructure the `seededPage` fixture instead of `page` — it seeds onboarding before the test body runs, so specs don't repeat a manual "seed onboarding" step. `settings-accounts.spec.ts` still seeds the *first* account this way but falls back to `completeOnboardingDefaults()` for the second (see the account-switch caveat above).
- Use `gotoPage(page, path, language, headingKey)`/`reloadPage(page, language, headingKey)` instead of hand-rolling `page.goto(path, { waitUntil: "domcontentloaded" }) + getByRole("heading", ...).waitFor()` — nearly every spec starts with this pattern and every reload-persistence check repeats it. Use `translateValue(language, key, value)` instead of hardcoding a rendered `{value}`-templated string (for example `"10%"` or `"Remove 20%"`) — it substitutes into the real translation key so the test tracks copy changes instead of silently drifting from it.
- Prefer `getByRole` with the translated accessible name (via `translate(language, key)`) as the default locator — it doubles as an accessibility check and tracks markup changes for free. Reserve `data-testid` for elements without a stable accessible name/role, or for elements that stay mounted in the DOM regardless of visibility (for example the payment-paid success overlay, which is toggled via `aria-hidden`/opacity rather than conditionally rendered — matched via `data-testid="payment-paid-panel"`, not a generic `[aria-hidden="false"]` attribute selector). Most local UI primitives (`Button`, `TabsTrigger`, `ToggleGroupItem`, ...) spread `...props` through to the native element, so `data-testid` can be passed directly as a prop without changing the component.
- Wrap each logical phase of a test — not each individual click — in `test.step(...)` inside the `*.spec.ts` file, typically one step per fixture-helper call (`completeOnboarding`, `createPayment`, `markCashPaid`, final assertion). This keeps the HTML report/trace readable without requiring step support inside the shared fixtures.
- There is no network mocking yet for Spark/FIO/Yadio/LNURL (planned for a later phase in `e2e.md`) — payment flows that hit those integrations are not yet deterministic in e2e.
