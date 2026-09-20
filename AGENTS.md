# Agent Guide

## Commands

- `bun run check` before handing work back. It is `check:lint` (Biome) + `check:ts` (`tsc -b`, tests included) + `check:tests` (Vitest); run those individually while narrowing a failure.
- `bun run format` applies Biome's fixes; `bun run test:watch` reruns Vitest on change; `bun run check:coverage` writes a report to `coverage/`.
- Vitest needs Node 24 (the CI version): the Evolu test client takes its lock manager from `navigator.locks`, which Node 22 does not have, so every `createEvoluTest()` suite fails there with `Cannot read properties of undefined (reading 'request')`.
- `bun run sync:linky [path-to-linky]` re-vendors the Linky packages (`@linky/linkshu`, `@linky/linksync`) from a Linky checkout (default `../linky`) into `packages/`; see the vendored-package rule under "Project Structure".
- `bun run dev` starts Vite over HTTPS with a self-signed cert, or with the mkcert certificate in `.certs/localhost.pem` + `.certs/localhost-key.pem` when those exist (README "Development" has the mkcert commands); `PAYKY_DISABLE_BASIC_SSL=1` turns TLS off entirely for Android live-reload.
- End-to-end tests are not part of `check` and need their own run — see "E2E Testing" below.

## Project Rules

- Write all code, comments, commit messages, and documentation in English.
- Commit messages follow Conventional Commits: `type(scope): imperative summary`, lowercase, no trailing period. Types in use are `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`; the scope names the module or feature touched (`refactor(payment):`). The subject says what changed and the body says why — put the reasoning there, not in the subject.
- Error reporting goes through `src/core/sentry.ts` and is opt-in per device (`errorReportingEnabled`, driven by `SentryController`). Report unexpected crashes only: `captureReportedError` has exactly two sanctioned call sites, the root error handler in `src/App.tsx` and `src/components/app/error-boundary.tsx`. Never pair it with a `toast.error` or any other handled failure — an expected `Result` the UI already shows the user is not a crash. Events are scrubbed of recovery phrases and IBAN-shaped strings, but keep secrets out of error payloads rather than relying on that.
- Use Bun for dependency management and scripts. Keep `exact = true` in `bunfig.toml`.
- Keep the app TypeScript-first and preserve strict compiler settings.
- Use shadcn-style local UI components in `src/components/ui`; primitives must come from Base UI.
- `src/components/ui` (shadcn) and `src/components/reui` (ReUI) are vendored third-party code, not ours. Never edit, refactor, shrink, or delete anything in them — not to remove an export nothing imports, not to trim an unused variant, not to fix a lint or style nit. They are kept byte-for-byte as upstream ships them so a registry re-add or upgrade stays a clean overwrite. Update them only by re-adding the component from its registry (`shadcn` CLI, ReUI MCP). An audit or dead-code scan flagging something in these two directories is a false positive; adapt the call site instead.
- Use Zod for form, domain, and Evolu schema validation.
- Store persistent application data through Evolu. Avoid direct `localStorage` except for non-critical UI preferences such as language.
- Use Biome for linting and formatting.
- Dates split two ways, and both sides are deliberate — don't hand-roll either with `padStart` and `getMonth() + 1`:
    - **Locale-aware display** the user reads goes through `Intl`/`toLocale*`, usually one of the `format*` helpers in `src/lib/format-utils.ts`.
    - **Date arithmetic and fixed machine formats** go through `date-fns`: `subDays`, `subMonths`, `isSameDay`, and `format(date, "yyyy-MM-dd")`. Its format tokens are locale-independent, which is exactly what a filename, an API parameter, or a stored `DateString` needs.
- Declare environment variables in a `createEnv` block (`@t3-oss/env-core`) with a Zod schema, as `src/core/cli/cli-env.ts` does, rather than reading `process.env` / `import.meta.env` at the point of use. One variable does not justify skipping it — the point is that every variable is validated and defaulted in one place.
- Do not create or use `index.ts` barrel files for re-exporting. Import directly from the owning module file.
- For asynchronous reads from remote or native APIs in React, use TanStack Query's `useQuery` rather than `useEffect` with local state. Use a stable `queryKey` and `enabled` for runtime or input preconditions; keep Evolu subscriptions on `useEvoluQuery`.
- `@dedalik/use-react` is a deliberate dependency and stays. It is a ~180-hook VueUse-style collection, and we intend to draw on more of it, so reach for it before hand-rolling a hook over a browser API — and do not propose dropping it on the grounds that only one hook is imported today.
    - Wrap it where its shape does not fit rather than re-implementing it. `useScreenWakeLock` wraps the library's imperative `useWakeLock` (`request`/`release`) in the declarative `enabled` lifecycle every caller here actually wants.
    - A local hook sharing a name with a library one is usually **not** a duplicate, and swapping it in would be a regression. `useNow`, `useDebouncedValue`, `useIntersectionObserver`, `useLocalStorageState` and `useConfirmDialog` each diverge from their namesake on purpose — scheduling, Suspense behaviour, ref shape, Zod validation, app-wide queueing. Read the local doc comment before assuming the library version is equivalent.
- To keep a frequently-changing value from re-rendering a whole subtree, hold it in a component-scoped Jotai atom, pass the **atom itself** down as a prop, and subscribe as deep as possible. `TerminalPaymentKeypad` in `src/features/terminal-home/terminal-payment-keypad.tsx` is the reference implementation for the entered amount:
    - Create it once per mount with `const [valueAtom] = useState(() => atom(initial))`. Never `useMemo` — that is a cache React may throw away, and a discarded one mints a fresh atom, silently losing the value. `useState`'s lazy initializer is the guaranteed-once one.
    - Pass `valueAtom` through as a plain prop. The components in between never read it, so they stay out of the update path entirely.
    - Only the leaves that actually render the value call `useAtomValue` — in the keypad that is `AmountDisplay` and `ChargeButton`, not the twelve `KeypadButton`s.
    - Write-only components take `useSetAtom`. A component that must read the current value inside an event handler but must not re-render for it uses `useStore()` and `store.get(valueAtom)` — that is why `Keypad`'s keydown handler reads it that way, and it is deliberate, not an oddity to clean up.
    - This buys real time on the hardware this app ships to. Measured on the keypad (Chrome, CDP `TaskDuration`, 600 keypresses): 2.8 ms per keypress with the atom versus 4.95 ms with a plain `useState` in the parent, and a Capacitor WebView on low-end Android multiplies that gap several times against a 16 ms frame.
    - Plain `useState` stays the default for state whose every consumer re-renders anyway. Reach for this pattern when a value changes on a per-keystroke/per-frame cadence and a measurably expensive subtree does not depend on it — and never remove an existing instance of it on the assumption that the re-render is free without measuring first.

## Project Structure

- `src/main.tsx` is the browser entry point. It installs polyfills and renders the React app.
- `src/polyfills.ts` is what `main.tsx` imports first: it installs Evolu's own polyfills and `src/polyfills/android-webview-locks.ts`, which fakes the `evolu-one-tab-sharedworker-polyfill` lock that Android WebView's `navigator.locks` cannot grant. `src/test/setup.ts` installs the Evolu polyfills for Vitest, which is configured in `vite.config.ts` (`test.exclude` keeps `e2e/**` out of the unit run).
- `src/App.tsx` wires top-level providers (Jotai store, theme, background jobs, toaster) and the TanStack Router provider.
- `src/router.tsx` creates the TanStack Router from `src/routeTree.gen.ts`; route files live in `src/routes`.
- `src/routes/__root.tsx` defines the root layout and error boundary; `src/routes/_terminal.tsx` is the layout route for the terminal pages. Keep route files thin and move substantial page UI into page or feature modules.
- `src/atoms` contains Jotai atoms that bootstrap app singletons: the device Evolu client, the app Evolu client, the active account, console, run, and the global confirm-dialog queue. Evolu clients are created here, not in `main.tsx`.
- `src/hooks` contains the React bindings for those singletons (`useEvolu`, `useEvoluQuery`, `useDeviceEvoluQuery`, `useConsole`, `useTranslation`, `useAppRun`, ...). Access Evolu from React through these hooks.
- `src/features` contains feature modules: page-level UI (forms, hooks, presentational components) for one feature, composed from domain modules and `src/components/ui` primitives. Substantial page UI extracted from routes belongs here, not in `src/routes` or `src/components` — `src/components` holds only app-lifecycle infrastructure and genuinely cross-feature presentational UI.
- `src/components/ui` contains shadcn-style reusable UI primitives built on Base UI, such as `button.tsx`. Keep generic UI here; avoid feature or domain logic in this directory. Vendored — see the project rule above.
- `src/components/reui` contains components vendored from the ReUI registry (`alert.tsx`, `stepper.tsx`, `timeline.tsx`). Vendored — see the project rule above.
- Three words describe three different levels of the app, and they are not interchangeable. **Terminal** is the app shell: the `_terminal` layout route wraps settings, activity, bills and payments alike, which is why `useTerminalHomeMode` and `useCreateTerminalPayment` carry it. **Home** is the index screen inside that shell (`_terminal.index.tsx`), which owns the `home.*` translation keys. **Pos** and **numpad** are the two modes that screen toggles between — `nav.pos` ("Sales", the table grid) and `nav.numpad` ("Keypad") — so `PosOverviewPage` is the pos-mode view, not a second name for the terminal. `src/features/terminal-home` holds both mode views because both are the home screen.
- `src/features/shared` holds option tables and copy that more than one feature collects — the fiat-currency and UI-language lists, which both settings and onboarding offer. A feature must not import from a sibling feature's folder; if two need the same thing, it moves here (or to `src/components` when it is a component).
- `src/components` holds two kinds of thing, and a new file belongs to one of them: the root is for cross-feature presentational UI (`fade-header.tsx`, `search-input.tsx`, `list-skeleton.tsx`, ...), and `src/components/app` is for the app-lifecycle singletons `App.tsx` mounts once (`app-background-jobs.tsx`, `confirm-dialog-host.tsx`, `error-boundary.tsx`, ...). Feature UI belongs in `src/features`, not here.
- `src/components/theme-provider.tsx` contains theme-level UI infrastructure. It is an app singleton and belongs in `src/components/app`, but it stays at the root because the vendored `src/components/ui/sonner.tsx` imports it from this exact path — moving it would mean editing vendored code, which the project rule above forbids.
- `src/core/evolu` contains Evolu client setup, the app schema composition, and the device database (`device-client.ts`, `device-account.ts`). Register new Evolu tables and indexes in `src/core/evolu/schema.ts`.
- `src/core/modules` contains domain modules. Each module owns its schema, branded ids/types, actions, queries, and tests for one domain concept.
- `src/core/modules/shared` contains lower-level domain helpers, shared schemas, Evolu dependency helpers, and the `getFirstOr` Result helper.
- `src/core/deps.ts` declares small injectable dependency objects (`FetchDep`, `DateDep`, `EvoluOwnerIdDep`); `src/core/error.ts` provides the `defineError` factory.
- `src/core/background-jobs` contains the background job framework (`BackgroundJobContext`, keyed task queue) and the sync jobs under `jobs/`. Jobs receive all effects — including `lockManager` — through their context; never use ambient globals such as `navigator.locks`.
- `src/core/integrations` contains HTTP clients for external services (FIO, Yadio, LNURL, donations). Every client goes through `appFetchAsJson` from `src/core/deps.ts` — or `fetchAndValidateJson`, which combines it with the schema check — validates responses with zod, and reports failures as `defineError` errors carrying `status` and `responseBody`. A client with a configurable host or credentials also exports a dep factory (`createFioApiDep` rotates tokens over a base URL, `createYadioApiDep` carries one); `lnurl-pay-client.ts` derives its host from the Lightning address it is handed and `donations-client.ts` calls this app's own same-origin `/api` route, so neither has one to carry.
- `src/core/spark` wraps the Spark wallet SDK behind `SparkWalletDep`. Do not call `SparkWallet.initialize`/`getOrCreateWallet` directly outside this wrapper; extend the wrapper when a consumer needs more of the SDK surface. Instances are pooled per mnemonic and ref-counted (`createRefCountedResourcePool` in `src/lib/ref-counted-resource-pool.ts`, behind `createSharedSparkSyncWallet`/`createDefaultSparkPaymentWallet`): dispose your own `sparkWallet.create()` result as usual, but the SDK instance itself is torn down only once every holder — the Spark sync job's long-held reference included — has released it, so a warm instance survives back-to-back calls for the same account. `src/core/server/donate-wallet.ts` is the one sanctioned exception: stateless per-request server code with no long-lived process to pool for.
- `src/core/linky` opens **Linky's own data** for the active account: `linky-browser-store.ts` builds an Evolu **7** client (`@evolu-v7/common`/`@evolu-v7/web`, npm aliases of `@evolu/common@7.4.1`/`@evolu/web@2.4.0` — Linky's relay speaks Evolu 7 and Evolu 8 changed the wire encoding; the web package's `@evolu/common` imports are rewritten to the alias by the Bun patch `patches/@evolu%2Fweb@2.4.0.patch`, and `patches/@evolu%2Fcommon@7.4.1.patch` makes its `hasNodeBuffer` require real `base64url` support — the Spark SDK installs the `buffer` polyfill as a global `Buffer` that lacks it, and Evolu 7 loads lazily after it; re-create both with `bun patch @evolu-v7/web` / `bun patch @evolu-v7/common` when those versions bump, and add the entry to `patchedDependencies` by hand, `bun patch --commit` does not) owned by Linky's meta owner (`deriveLinkyMetaOwnerMnemonic`), on Linky's relays (`linky-env.ts`), and `linky-store.ts` composes `@linky/linksync`'s store and repositories over it (`LinkyStoreHandle`: `wallet`, `identity`). Every read and write of Linky data goes through those repositories, never straight to that Evolu. `linky-identity.ts` resolves the active Nostr key (the synced identity row first, then NIP-06 derivation) and `nostr-profile.ts` reads and publishes the kind-0 profile (`profile-name.ts` is Linky's name normalizer, copied). One store per account: `linkyStoreProviderAtom` opens it lazily and shares it with the cashu wallet; tests use `createInMemoryLinkyStore` from `linky-store-test-fixtures.ts`.
- `src/core/cashu` wraps `@linky/linkshu` (Linky's Effect-based cashu wallet library) behind `CashuWalletDep`: `createCashuWallet` owns the one `ManagedRuntime` per seed and the topup watcher scope; its `ProofStore`/`OperationStore` are the Linky store's wallet repository (so the inventory is Linky's, not a copy) and the Web-Storage `KeyValueStore` (`cashu-key-value-store.ts`) holds device-local counters and leases. Effect stays inside this directory; everything else sees plain promises over plain values and a `CashuWalletError`. The library and `effect` are imported dynamically (`cashu-linkshu.ts`) so a terminal without a cashu account never loads them. There is one wallet per account, held by `cashuWalletAtom` and handed to both `useAppRun` and the background jobs — never build a second one; `CashuWalletDep` is `null` only where no account master key exists (the CLI). The seed is derived from the account master key at `m/83696968'/39'/0'/24'/0'` exactly as Linky does (`key-derivation-cross-app.test.ts` pins it), so one SLIP-39 phrase opens the same ecash balance in both apps.
- `src/core/cli` contains CLI-runtime helpers (`cli-env.ts`, the in-process lock manager); CLI entry points live in `bin/`.
- `api` contains Vercel serverless functions (see `vercel.json` for routing) backing the donation feature: `api/donations.ts` and `api/lnurlp/donate.ts`, both built on `src/core/server/donate-wallet.ts`.
- `src/core/native` contains Capacitor/WebView runtime detection and platform plumbing.
- `src/core/sentry.ts` wraps `@sentry/react`: enable/disable, the event and breadcrumb scrubbers, and `captureReportedError`. See the project rule above before adding a call site.
- `src/core/query-client.ts` exports the one TanStack `queryClient` the app provides; create no others.
- `src/i18n` contains translation resources and the translation hook. Keys are grouped into seven files per language — `<lang>/settings.ts`, `landing.ts`, `bill.ts`, `payment.ts`, `withdraw.ts`, `onboarding.ts`, `common.ts` — and `<lang>.ts` only spreads them together. Add a key to the file whose group its namespace belongs to; `common.ts` takes the small app-wide namespaces (`app`, `appError`, `nav`, `country`, ...). `src/i18n/en.ts` remains the source of truth for `TranslationKey`. Coverage is checked twice: each `cs`/`sk` group file `satisfies Record<keyof typeof en<Group>, string>` so a missing key names the file it is missing from, and `cs.ts`/`sk.ts` still `satisfies Record<TranslationKey, string>` so a key filed under the wrong group is caught too. `resources.ts` only composes the languages.
- `src/lib` contains app-level generic utilities such as `cn`; keep domain code in `src/core/modules` instead.
- `src/assets` contains static frontend assets.
- `src/index.css` contains global Tailwind and theme styles.
- `src/zod-utils.ts` contains app-level Zod helpers that are not specific to one domain module.
- `e2e` contains Playwright end-to-end tests (`playwright.config.ts` at the repo root). See "E2E Testing" below for conventions.
- Outside `src`: `docs` holds `bill-payment-states.md` plus the generated screenshots and videos; `remotion` holds the Remotion compositions `bun run docs:videos` renders from the captures `bin/generate-doc-videos.ts` makes; `android` and `ios` are Capacitor native projects regenerated by `bun run cap:sync`, so change them only where Capacitor does not overwrite; `skills` is vendored agent skills pinned by hash in `skills-lock.json` — re-fetch them, do not hand-edit; `packages/linkshu` and `packages/linksync` are `@linky/linkshu` and `@linky/linksync` vendored from the Linky repository by `bin/sync-linky-packages.ts` (origin commit in each `SOURCE.json`; linksync's `@evolu/common` imports are rewritten to `@evolu-v7/common` on the way) — they cannot be `file:`/`link:` dependencies because Bun resolves their `workspace:*` devDependencies and CI builds this repo alone — so never hand-edit them: fix upstream in Linky and run `bun run sync:linky`. Each is its own TypeScript project (`tsconfig.json` written by the sync script, referenced from `tsconfig.app.json`) with Linky's compiler options, and Biome ignores them.

## Domain Module Structure

- Use `*-types.ts` for branded ids, domain enums/unions, and exported domain types.
- Export every part of an id definition, including the raw `id(...)` schema: `export const ItemIdRaw = id("Item")`, `export const ItemId = standardSchemaToZod(ItemIdRaw)`, `export type ItemId = typeof ItemIdRaw.Output`. `*IdRaw` usually has no importer outside its own file — export it anyway. Id definitions are uniform on purpose, so a dead-export scan flagging `*IdRaw` is a false positive; prefer the zod-wrapped `XId` at call sites and in table schemas.
- Use the module root file, for example `payment.ts`, for Evolu table schemas, detail/extension table schemas, indexes, and `InferTable` row exports.
- Use `*-actions.ts` for Evolu mutations and command-style domain operations. Expected domain failures should return `Result`.
- Use `*-queries.ts` for reusable Evolu queries and read models.
- Use `*-utils.ts` for pure domain helpers that are not tied to Evolu mutation execution.
- Split a `*-guards.ts` out of a large `*-actions.ts` when the read-and-validate
  layer has grown its own vocabulary — `bill-guards.ts` holds
  `loadBillStatusSnapshot`/`requireBillInStatus`/`requireEditableBill` and the
  errors they raise, leaving `bill-actions.ts` the mutations. Guards read and
  return `Result`; they never write. Errors belong with the half that raises
  them, which is also what keeps the two files from importing each other.
- Keep tests beside the module they cover as `*.test.ts`.
- For aggregate detail/extension tables sharing the root id, keep root and detail table ownership in the same module, and soft delete only the root row — unless the detail clearly owns a separate lifecycle.
- An actions file writes only to tables its own module owns. To write another module's table, compose that module's Task instead of upserting directly, as `bill-actions.ts` does with `bill-line` and `item` actions.
- The intended bill/payment lifecycle — `bill.status` values and transitions, `payment` cancellation/expiry, and how the two combine into a derived paid/underpaid/overpaid coverage — is specified in `docs/bill-payment-states.md`. Read it before changing `bill-guards.ts`, `bill-actions.ts`, `payment-actions.ts`, or any status/coverage derivation between them.

## Domain Action Patterns

- Write every action as an Evolu `Task<T, E, D>` from `@evolu/common` and access dependencies through `run.deps`, as in `payment-actions.ts`. Simple Evolu-only actions typically need `EvoluDep & EvoluOwnerIdDep`. (The legacy curried `(deps) => async (...)` style has been fully removed; do not reintroduce it.)
- In React, obtain runs through `useAppRun()` from `src/hooks/use-app-run.ts`: `const appRun = useAppRun()` then `await using run = appRun()` inside handlers. Do not call `createRun` directly in components; the only sanctioned exception is `app-background-jobs.tsx`, which additionally needs `lockManager` and `onError`.
- Inside an `await using run = appRun()` scope, always `await` calls to `run(...)`/`run.orThrow(...)` before returning — never `return run.orThrow(...)` bare. `await using` disposes `run` as soon as the enclosing function's synchronous execution finishes, so returning the promise unawaited disposes `run` before the task actually completes.
- Express Task dependencies as intersections of small dependency objects, for example `EvoluDep & SparkWalletDep & FetchDep`.
- In tests, create a concrete deps object with fakes for external services and run Task actions with `await using run = testCreateRun(deps)` followed by `await run(action(...))`.
- When a Task calls another Task, compose it with `await run(otherTask(...))` and propagate non-ok results directly when the error type is part of the caller's error union.
- Keep direct dependency calls for non-Task services, for example `run.deps.evolu.loadQuery(...)` or `run.deps.sparkWallet.create(...)`.
- Define action input object types inline in function parameters; avoid separate `CreateXInput` or `UpdateXInput` aliases.
- For CRDT actions, write tombstones and updates directly without preloading rows, unless current data is required for a domain invariant.
- Pass Evolu mutation payloads through `removeUndefinedValues` to avoid extra or undefined fields.
- When code must wait for an Evolu mutation to complete before running follow-up work, use `runMutationWithCompletion` from `src/core/modules/shared/evolu-utils.ts` instead of hand-rolled `onComplete` promises.
- Minimize the number of `runMutationWithCompletion` batches a Task performs where possible: prefer folding related upserts into one shared batch over several sequential ones, since each batch is an extra awaited round trip and a window where a partial write could be observed. When composing another module's write logic into your own batch, split that module's exports into a load/compute Task (no upsert) and a plain upsert function taking the caller's `MutationOptions`, as `payment-number-actions.ts`'s `loadNextPaymentNumber`/`upsertPaymentNumberRows` do for `createPayment`, instead of calling a Task that always opens its own separate batch.
- In Task code, use `run.deps.console` for all logging. Do not call global `console.log`, `console.warn`, `console.error`, or related console methods directly.
- Clean up disposable resources acquired inside Task actions with `await using`, as with wallet cleanup in `createPreparedPayment`.
- Define domain errors with `defineError` from `src/core/error.ts` and export their types via `ReturnType`, for example `const createPaymentNotFoundError = defineError("PaymentNotFound")<{ readonly id: PaymentId }>()` with `export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>`. Type each Task's `E` as the union of its expected errors.
- Return `err(createXNotFoundError({ id }))` for missing domain rows or required related records instead of throwing. Use `getFirstOr(rows, error)` from `src/core/modules/shared/result.ts` to turn a load-first query into a `Result`.
- For a React call site invoking a Task whose error type is `never` (its only realistic failure is an unexpected infra error, not a domain `Result`), don't build bespoke pending/error UI: call it in a plain `try`/`catch` and show `toast.error(t("settings.saveFailed"))` on failure, letting the surrounding UI (button, dialog) act optimistically — close/navigate immediately rather than waiting on the mutation. See `saveFiatCurrency` in `_terminal.settings.fiat.tsx` and the catalog-item delete confirmation in `item-form-page.tsx` for this pattern.

## Translation Key Rules

- Never hardcode user-facing text in React components.
- Add every visible label to `src/i18n/en.ts` and translate it in `cs.ts` and `sk.ts`; the `satisfies Record<TranslationKey, string>` checks enforce full coverage.
- Use `t(key, params)` with `{name}`-style placeholders for dynamic values instead of string concatenation.
- Use dot-separated, feature-scoped keys, for example `pay.request`, `settings.language`, or `activity.empty`.
- Do not rename existing translation keys without updating every usage.
- Prefer stable semantic keys over text-derived keys; key names should describe purpose, not exact copy.

## TypeScript Rules


- Prefer immutability by default:
    - Use `const` unless reassignment is required.
    - Prefer `readonly` fields and `Readonly<...>`/`ReadonlyArray<...>` for read-only data.
    - Return new objects/arrays instead of mutating existing values unless mutation is required by a local API.
- Map a union to a value with a lookup object, not a `switch`:
    - When every branch just returns a value for a union member — an error type to a translation key, a status to a label — declare `const xKeys = { ... } satisfies Record<TheUnion["type"], Value>` and index it (`xKeys[error.type]`). See `confirmErrorKeys` in `withdraw-page.tsx`.
    - `satisfies Record<...>` is what makes this exhaustive, and it checks *both* directions: a missing member fails to satisfy the type, and a stale key for a member that no longer exists is rejected as an unknown property. A `switch` with a trailing `assertNever` only catches the first, which is why the `assert-never` dependency is gone — don't reintroduce it.
    - Keep a `switch` when branches do more than produce a value (side effects, early returns, differing control flow) or when a case needs the narrowed member rather than just its tag.
- Use Result-based error handling for expected failures:
    - Import `Result`, `ok`, and `err` from the `@evolu/common` module.
    - Reserve thrown exceptions for programmer errors, schema decode failures, unexpected infrastructure failures, framework boundaries, and established local patterns.
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
    - The ones imported today are `ValueOf`, `Simplify`, `EmptyObject`, `JsonValue`, `ConditionalExcept`, `RequireExactlyOne`, and `RequireOneOrNone`.
    - For mutually exclusive fields (exactly one of a set required, or at most one allowed), use `RequireExactlyOne`/`RequireOneOrNone` instead of hand-writing a union of `?: never` siblings.
    - Do not add a new custom utility type when `type-fest` already provides a clear equivalent.
- Prefer `async`/`await` over `Promise.then(...)` chains.
    - Keep promise combinators such as `Promise.all` when they express concurrency clearly.
    - Keep `Promise.all([...])` tuples reasonably short; if the list grows past 10 items, split it into coherent groups or use another typed pattern.
- Represent money as integer minor units — the branded `Integer`/`NonNegativeInteger` numbers the Evolu schema stores (`payment.amount`, `billLine.totalAmount`) — never floating-point. Convert through the helpers in `src/core/modules/shared/money.ts` (`decimalAmountToMinorUnits`, `minorUnitsToDecimalString`) instead of ad hoc parsing, and take the number of fraction digits from `currencyFractionDigits` rather than assuming two.
- Preserve exhaustive typing for finite variants.
    - Use the established nearby exhaustive-check pattern for switches or branches over unions/enums.
    - Use `satisfies Record<EnumOrUnion, ...>` for enum/union-keyed maps when completeness should be enforced while preserving literal value types.
- Prefer named exports.
    - Avoid new default exports unless the nearby module family already uses them or a framework requires them, such as Storybook stories or existing framework interop helpers.

## E2E Testing

- Playwright end-to-end tests live in `e2e/`. Their conventions — how the dev server, seeding, fixtures, locators and steps work — are in `e2e/AGENTS.md`. Read it before touching anything under `e2e/`.
- `bun run test:e2e` (headless, dev server), `test:e2e:ui` (interactive), `test:e2e:preview` (against a one-off production build). E2E is not part of `bun run check`.
