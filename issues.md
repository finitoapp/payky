# Architecture Review Issues — React Components (2026-07-07)

Findings from an architectural review of the React layer (`src/routes`, `src/components`, `src/features`, `src/hooks`, `src/atoms`). Each issue is written to be self-contained so a smaller LLM agent can pick it up without other context.

## Instructions for every issue (read first)

- Read `AGENTS.md` in the repo root before starting. It is the source of truth for architecture rules; every fix must comply with it.
- Line numbers below were captured at commit `ab768c1` and may have drifted. Always locate code by grepping for the quoted identifiers/strings, not by line number alone.
- Do NOT create `index.ts` barrel files. Import directly from the owning module file.
- All user-facing text must go through `t(...)` with keys added to `src/i18n/en.ts` AND translated in `cs.ts` and `sk.ts` (the `satisfies Record<TranslationKey, string>` checks enforce coverage).
- Domain actions are Evolu `Task`s in `src/core/modules/<module>/<module>-actions.ts`, run from React via `useAppRun()` (`const appRun = useAppRun(); await using run = appRun()`). Never call `createRun` directly in components.
- Expected failures return `Result` (`ok`/`err` from `@evolu/common`) with errors defined via `defineError` from `src/core/error.ts`.
- Verify with `bun run check` (runs biome lint, `tsc -b`, and vitest) before declaring an issue done.
- Keep each issue's diff scoped to that issue. If you notice an adjacent problem, leave it — it probably has its own issue below.

Severity: **P1** = user-visible bug or resource leak, fix first. **P2** = systemic pattern with data-loss or staleness risk. **P3** = structural refactor (violates the project's own architecture rules). **P4** = smaller cleanup.

---

## P1 — Bugs

### Issue 1: Withdraw review screen lowercases Base58 bitcoin addresses

**Files:** `src/features/withdraw/withdraw-page.tsx`, `src/features/withdraw/withdraw-utils.ts`, `src/features/withdraw/withdraw-utils.test.ts`

**Problem:** `formatAddressGroups` in `withdraw-page.tsx` (~line 105) formats the destination address for the final confirmation screen of an irreversible on-chain send:

```ts
const formatAddressGroups = (address: string): string =>
  address
    .toLocaleLowerCase()
    .replaceAll(/\s+/gu, "")...
```

`isValidBitcoinAddress` (`src/core/modules/withdrawal/withdrawal-utils.ts`) accepts legacy Base58 addresses (`1...`, `3...`), which are **case-sensitive**. Lowercasing is only safe for bech32 (`bc1...`/`tb1...`). A user comparing the displayed string against the recipient's real address sees a mismatch — or worse, "verifies" a string that is not the address being paid.

**Fix:**
1. Move `formatAddressGroups` out of the component into `src/features/withdraw/withdraw-utils.ts` (pure helper, belongs in `*-utils.ts`).
2. Change it to lowercase only when the address starts with a bech32 HRP (case-insensitive check for `bc1`/`tb1` prefix); otherwise preserve the original casing. Keep the whitespace stripping and grouping behavior.
3. Add unit tests in `withdraw-utils.test.ts`: a Base58 address keeps its mixed case; a bech32 address in uppercase QR form (`BC1Q...`) is lowercased; grouping output unchanged for existing cases.

**Acceptance:** tests cover both address families; the review step renders the exact Base58 string the user entered; `bun run check` passes.

---

### Issue 2: Withdraw error mapping matches an English error-message string

**Files:** `src/features/withdraw/withdraw-page.tsx`, `src/core/modules/withdrawal/withdrawal-actions.ts`, `src/core/modules/withdrawal/withdrawal-types.ts` (create the error there or wherever sibling error types live — check the module's existing layout)

**Problem:** The page distinguishes two failure modes of `executeWithdrawal` by comparing a message literal:

```ts
case "WithdrawalFailed":
  return error.message === "Failed to record the withdrawal transaction"
    ? "withdraw.review.error.recordFailed"
    : "withdraw.review.error.sparkFailed"
```

The literal is created in `withdrawal-actions.ts` (~line 218). Any rewording silently breaks the mapping. Related smell: `quoteErrorKey(errorType: string)` and the local `ConfirmWithdrawalError { type: string }` in `withdraw-page.tsx` throw away the typed error unions that the actions already export, losing the exhaustiveness checking AGENTS.md mandates ("Preserve exhaustive typing for finite variants").

**Fix:**
1. Define a distinct error with `defineError`, e.g. `createWithdrawalRecordFailedError = defineError("WithdrawalRecordFailed")<...>()`, exported alongside the module's other error types. Return it from the "failed to record" branch in `executeWithdrawal` instead of reusing the generic `WithdrawalFailed` with a special message. Add the new error to the Task's `E` union.
2. In `withdraw-page.tsx`, type the error→translation-key mappers against the Tasks' actual exported error unions (plus the run's `AbortError` if it can surface). Replace `string`-typed error state with the union types and close each `switch` with the repo's `assert-never` pattern so adding an error type becomes a compile error.
3. Add the translation keys if any new ones are needed (all three languages).

**Acceptance:** no string comparison on `error.message` anywhere in the withdraw feature; mappers are exhaustive switches over typed unions; `bun run check` passes.

---

### Issue 3: Payment-method prepare failure is a dead end — retry is permanently blocked

**Files:** `src/routes/_terminal.payment_.$paymentId.tsx` (until Issue 12 extracts the feature; coordinate if both are in flight)

**Problem:** Preparing a payment method is fired from a `useEffect` and deduplicated via a component-lifetime ref (~lines 260, 442–443):

```ts
const prepareKey = `${paymentId}:${activePaymentMethod.id}:${activePaymentMethod.accountId}`
if (preparePaymentMethodKeysRef.current.has(prepareKey)) return
preparePaymentMethodKeysRef.current.add(prepareKey)
```

The key is **never removed on failure** (verified: the file contains only `.has` and `.add`, no `.delete`). After a failure sets `preparePaymentErrorMethods`, that method can never be prepared again until the page unmounts, and the UI offers no retry. A transient network failure bricks the payment method for the session. The workflow state is smeared across two `useState`s, the ref, and an effect whose dependency array includes state the effect itself writes.

**Fix:**
1. Extract a hook (inside the route file for now, or in `src/features/payment-wait/` if Issue 12 has landed), e.g. `usePreparePaymentMethod`, that models per-method state explicitly: `Map<string, "preparing" | { error: ... }>` — a method absent from the map is idle and may be (re)prepared.
2. On failure, store the error state so the effect does not immediately re-fire in a loop, but expose a `retry(methodKey)` action that clears the entry and re-triggers preparation. Remove the ref entirely; gate on the state map instead.
3. Surface a retry button in the existing error UI for the method (new translation keys in en/cs/sk if none fit).
4. Prefer triggering preparation from an explicit place (selection change handler + initial mount) rather than a state-watching effect, if achievable without behavior change.

**Acceptance:** simulate a failure (e.g. temporarily make the prepare Task return `err`) — the error UI shows a retry control, and retrying re-attempts preparation for the same method. No unbounded re-prepare loop on persistent failure. `bun run check` passes.

---

### Issue 4: `evoluAtom` keeps mutable module-level state and leaks the previous Evolu client

**Files:** `src/atoms/evolu.ts`, `src/atoms/evolu-counter.ts` (read-only context: `src/hooks/use-evolu.ts`, callers that bump the counter)

**Problem:** (~lines 7–27)

```ts
let previousEvoluUnuse: (() => unknown) | undefined
export const evoluAtom = atom(async (get) => {
  ...
  if (previousEvoluUnuse !== undefined) previousEvoluUnuse()
  previousEvoluUnuse = isNonEmptyArray(account.transports)
    ? evolu.useOwner(evolu.appOwner, account.transports)
    : undefined
```

Three problems: (1) side effects (subscription management) inside an atom **read** — recomputation timing is Jotai's business; (2) the module-level variable escapes the Jotai store, so a second store (tests, HMR) shares/clobbers it; (3) when `evoluCounterAtom` bumps (transport toggled, account switched), a **new** Evolu client (worker + SQLite) is created while the old one is only "un-owned", never disposed — a resource leak in a long-lived terminal app, and stale subscriptions from the old client may still fire.

**Fix:**
1. Investigate what disposal API the Evolu client exposes (check `@evolu/common` typings — `Symbol.asyncDispose`, `dispose`, or a reset API).
2. Restructure so the previous client's `unuse` + disposal happen through store-owned lifecycle: hold `{ evolu, unuse }` together and dispose the previous instance when a new one is created. Acceptable implementations: an `atom.onMount`-based wrapper, `atomWithRefresh`, or tracking the previous handle in atom state passed through the store — anything that removes the module-level `let` and disposes the old client.
3. Keep the public shape consumed by `use-evolu.ts` and `use-evolu-query.ts` unchanged, or update those hooks in the same change.

**Acceptance:** no module-level mutable state in `src/atoms/evolu.ts`; toggling a transport (Settings → Security) still reloads the app client and sync keeps working; the previous client is unused **and** disposed; `bun run check` passes.

---

## P2 — Systemic patterns

### Issue 5: Settings forms hydrate local state from Evolu rows via `useEffect` — sync clobbers in-progress edits

**Files:** `src/routes/_terminal.settings.payment-accounts.tsx` (3 occurrences, ~lines 123, 305, 502), `src/routes/_terminal.settings.fio-plugin.tsx` (~line 170), `src/routes/_terminal.settings.payment-number-series.tsx` (~line 134)

**Problem:** Five forms mirror an Evolu query row into `useState` via an effect:

```ts
useEffect(() => {
  setEnabled(account ? account.isDeleted !== 1 : false)
  setIban(account?.iban ?? "")
  ...
}, [account, settings?.fiatCurrency])
```

Every re-emit of the query resets the inputs. In a local-first, multi-device CRDT app this is not theoretical: a background sync (or the fio background job touching the plugin row) while the user is typing silently discards their edits. It is also the classic "mirror props into state via effect" anti-pattern, plus a wasted double render on mount.

**Fix (apply the same pattern at all 5 sites):**
1. Split each affected form into a component that receives the row and initializes state once: `useState(account?.iban ?? "")` with **no** syncing effect.
2. Have the parent render it keyed by record identity: `<FiatBankAccountForm key={account?.id ?? "new"} account={account} />` so a *different* record remounts the form, but re-emits of the *same* record never touch user input.
3. Where a second dependency exists (e.g. `settings?.fiatCurrency` feeding a default), include it in the key only if the form should reset when it changes; otherwise read it at render.
4. Delete the hydration effects.

**Acceptance:** grep confirms no `useEffect` in those files whose body is only `set*(...)` calls mirroring a query row; typing in a form while the underlying row re-emits (can be simulated by an unrelated field update from a second tab, or by code inspection) preserves the draft; `bun run check` passes.

---

### Issue 6: `evoluCounterAtom` manual cache invalidation is duplicated across 4 files

**Files:** `src/atoms/evolu-counter.ts`, `src/hooks/` (new hook), call sites: `src/features/settings/security/transport-toggle-list.tsx` (~line 89), `src/features/settings/security/evolu-transport-card.tsx` (~line 47), `src/routes/_terminal.settings.accounts.tsx` (~line 75), `src/routes/onboarding.tsx` (~line 541)

**Problem:** Reloading the app Evolu client is done by hand-bumping a counter atom (`setEvoluCounter((c) => c + 1)`) in four places. Any future transport/account mutation that forgets the bump leaves the app running on a stale Evolu client with old transports — a silent, hard-to-diagnose failure. The mechanism has no single name or owner.

**Fix:**
1. Add a write-only atom in `src/atoms/evolu-counter.ts`, e.g. `export const reloadAppEvoluAtom = atom(null, (_get, set) => { set(evoluCounterAtom, (c) => c + 1) })`, and stop exporting the raw counter for writing if possible (it must stay readable by `evoluAtom`).
2. Add `src/hooks/use-reload-app-evolu.ts`: `export const useReloadAppEvolu = () => useSetAtom(reloadAppEvoluAtom)`.
3. Replace all four call sites with `const reloadAppEvolu = useReloadAppEvolu()` / `reloadAppEvolu()`.

**Acceptance:** `grep -rn "evoluCounter" src` shows writes only inside `src/atoms/evolu-counter.ts`; toggling a transport and switching accounts still take effect immediately; `bun run check` passes.

---

### Issue 7: Device-Evolu writes are scattered raw through components; the same one-field `deviceSettings` update is copy-pasted 4×

**Files:** `src/components/theme-provider.tsx` (~line 81), `src/hooks/use-locale.ts`, `src/hooks/use-translation.ts` (`useTranslationForLanguage`, ~line 40), `src/hooks/use-error-reporting.ts`; also `src/routes/_terminal.settings.accounts.tsx` and `src/routes/onboarding.tsx` (account mutations — see Issue 13/19 overlap notes)

**Problem:** Reads go through `useDeviceEvoluQuery`, but writes reach into `deviceEvoluAtom` ad hoc. Four hooks/components each hand-roll the identical `deviceEvolu.update("deviceSettings", { id: deviceSettingsId, <field>: value })` boilerplate. `useTranslationForLanguage` is additionally misnamed — it *sets* the language.

**Fix:**
1. Add a single hook, e.g. in `src/hooks/use-device-settings.ts` (it already owns device-settings reading): `useUpdateDeviceSettings(): (patch: Partial<...>) => void` that resolves the device Evolu handle + settings row id and performs the update.
2. Rewrite the theme write in `theme-provider.tsx`, `useSetLocale`, the language setter, and `useSetErrorReportingEnabled` as one-liners over it (or delete a hook entirely where it becomes trivial and update its callers).
3. Rename `useTranslationForLanguage` to `useSetLanguage` and update all usages.

**Out of scope:** account select/rename/remove mutations (covered by Issue 19).

**Acceptance:** exactly one place in `src/` calls `deviceEvolu.update("deviceSettings", ...)`; theme, language, locale, and error-reporting toggles still persist across reload; `bun run check` passes.

---

### Issue 8: `accountAtom` performs Evolu writes during atom read

**Files:** `src/atoms/account.ts` (~lines 52, 70)

**Problem:** The async read of `accountAtom`/`activeAccountRowAtom` calls `insertAccount(...)` as a fallback when no account exists, and `deviceEvolu.upsert("device", device)`. Async read atoms recompute whenever `evoluCounterAtom` bumps or the store is recreated; creating accounts/devices as an invisible consequence of *rendering* is the classic Jotai side-effect smell and is racy under concurrent first computation (currently saved only by idempotence of the lookup).

**Fix:**
1. Extract the bootstrap ("ensure an active account exists", "register the device row") into an explicit function, e.g. `ensureActiveAccount(deviceEvolu)` in `src/core/evolu/device-account.ts` (near the existing account helpers).
2. Invoke it from the app bootstrap path — the most natural spot is inside `deviceEvoluAtom` initialization or a dedicated init atom that `App.tsx` awaits — so it runs once per client, not once per read recomputation.
3. Make `accountAtom` a pure read that returns/throws when no account exists (it already has an error path for this).

**Acceptance:** `src/atoms/account.ts` contains no `insert`/`upsert` calls in atom read functions; fresh-profile first launch still auto-creates the account and device row (verify by clearing site data and loading the app); `bun run check` passes.

---

## P3 — Structural refactors (AGENTS.md violations)

> These are move-and-extract refactors. Preserve behavior exactly; keep commits mechanical where possible (move first, then adjust imports).

### Issue 9: `withdraw-page.tsx` is a 640-line god component — model the flow as a reducer with a discriminated union

**Files:** `src/features/withdraw/withdraw-page.tsx` (+ new files in `src/features/withdraw/`)

**Problem:** Step flow (`form → review → result`), quote, result, three error slots, and two pending flags live in ~13 independent `useState`s. Invalid combinations are papered over with render guards (`step === "review" && quote ?` — if the invariant breaks, the page renders *nothing*). Going back to the form does not clear `quote`, so nothing structurally prevents confirming a quote computed for a different address/amount.

**Fix:**
1. Introduce a reducer with a discriminated union, roughly:
   ```ts
   type WithdrawState =
     | { step: "form"; /* field state + field errors */ }
     | { step: "review"; address: string; quote: WithdrawalQuote; exitSpeed: SparkExitSpeed; error: ... | null; confirming: boolean }
     | { step: "result"; result: { txid: string | null; status: string } }
   ```
   so a quote can only exist in `review` and the `BACK` action provably discards it.
2. Split each step into its own component file in the feature dir (only `ReviewStep`/`ReviewRow` are split today; the form and result JSX are inlined): `withdraw-form-step.tsx`, `withdraw-review-step.tsx`, `withdraw-result-step.tsx`.
3. While touching `ReviewStep`: replace the inline total computation (`quote.withdrawAll ? quote.availableSats : quote.amountSats + feeEstimate.totalFeeSats`) with the existing `computeTotalDebitedSats` from `src/core/modules/withdrawal/withdrawal-utils.ts` — the review screen must show the exact number written to the ledger.
4. Do not change the actions layer; error typing is Issue 2 (coordinate if both are open — Issue 2 first is easier).

**Acceptance:** no bare `useState` for step/quote/result (form-field drafts may stay local state or live in the reducer, your call); back-then-edit-then-review always produces a fresh quote; total shown on review uses `computeTotalDebitedSats`; `bun run check` passes.

---

### Issue 10: Withdraw balance is loaded by constructing a Spark wallet inside a component `useEffect`

**Files:** `src/features/withdraw/withdraw-page.tsx` (~lines 136–158), `src/core/modules/withdrawal/withdrawal-actions.ts`

**Problem:**

```ts
await using wallet = await createDefaultSparkPaymentWallet(mnemonic)
const balance = await wallet.getBalance()
...
} catch {
  if (active) setAvailableSats(null)
}
```

(a) side-steps `SparkWalletDep`/`useAppRun()` — every other Spark call goes through `run.deps.sparkWallet` per AGENTS.md; (b) errors are swallowed by a bare `catch {}` without even `run.deps.console` logging; (c) the wallet is expensive to initialize and is spun up *again* moments later by `quoteWithdrawal`; (d) the effect cannot abort wallet creation, only ignore the result.

**Fix:**
1. Add a Task in `withdrawal-actions.ts`, e.g. `getWithdrawalBalance(): Task<{ readonly availableSats: number }, <appropriate error union>, SparkWalletDep & ...>` following the file's existing conventions (see `quoteWithdrawal` for how the wallet is acquired and cleaned up with `finally`).
2. In the component, call it via `useAppRun()` from an effect or, better, a react-query wrapper if the codebase pattern for read Tasks in components uses one (check how `donation-history.tsx` runs a Task via react-query and mirror it).
3. Log/surface failures: at minimum show the existing "balance unavailable" state deliberately, and don't swallow the error silently — non-ok result should reach `run.deps.console` inside the Task or an error state in the component.

**Acceptance:** `createDefaultSparkPaymentWallet` is not imported by any file under `src/features/`; balance still displays on the withdraw form; failure to load balance is observable (console dep log or UI state); `bun run check` passes.

---

### Issue 11: Withdraw QR scanner accepts any payload and its error state is sticky

**Files:** `src/features/withdraw/withdraw-qr-scanner.tsx` (~lines 21–27), `src/features/withdraw/withdraw-utils.ts`

**Problem:** `parseScannedBitcoinAddress` never fails — any scanned text (a URL, random QR) becomes `{ address: rawText }` — and `applyScannedAddress` closes the scanner immediately, so the user only learns it was garbage after pressing Continue. Also the `hasError` state is never reset after a subsequent successful frame.

**Fix:**
1. Validate inside the scan handler with `isValidBitcoinAddress` from `src/core/modules/withdrawal/withdrawal-utils.ts` (applied to the parsed address, which may come from a BIP21 URI — keep the existing URI parsing).
2. On invalid payloads keep scanning and show a translated hint (new key, e.g. `withdraw.scanner.notBitcoin`, in en/cs/sk).
3. Reset the error/hint state when a later frame scans successfully.

**Acceptance:** scanning a non-bitcoin QR keeps the overlay open with a hint; scanning a valid address (bare or BIP21) closes it and fills the field; `bun run check` passes.

---

### Issue 12: Extract the payment-wait feature from the 887-line route `_terminal.payment_.$paymentId.tsx`

**Files:** `src/routes/_terminal.payment_.$paymentId.tsx` → new `src/features/payment-wait/` (name it consistently with existing features), `src/core/modules/payment/payment-queries.ts`, `src/core/modules/account/*-queries.ts` (check which module owns each query)

**Problem:** The route file contains the app's core screen in full: three substantial Kysely queries (~lines 105–205), payment-method assembly from account rows (~274–363), prepare orchestration, wake-lock management, cash-paid handling, and five sub-components. Direct violation of AGENTS.md "Keep route files thin and move substantial page UI into page or feature modules". `_terminal.settings.withdraw.tsx` (12 lines) + `src/features/withdraw/` is the target shape.

**Fix (mechanical move, no behavior change):**
1. Move the three inline queries into the owning modules' `*-queries.ts` files (payment queries → payment module; account/method queries → account module). Export with descriptive names.
2. Create `src/features/payment-wait/payment-wait-page.tsx` and move all components there; extract `use-payment-method-options.ts` (method assembly — wrap the assembled list in `useMemo`; this page re-renders on every Evolu sync tick and `createBankQrPayloads` currently runs each render) and, if Issue 3 landed, keep its prepare hook here.
3. While moving, delete two redundant effects: the "reset selection when it disappears" effect (~409–420) — the render-time fallback chain (`selectedPaymentMethodOption ?? defaultPaymentMethodOption ?? orderedPaymentMethods[0]`) already handles stale selection; and the `successVisible` latch effect (~250, 403–407) — replace with `const successVisible = isPaid` (a claim row is never un-claimed within the page lifetime).
4. The route file keeps only `createFileRoute` + params parsing + rendering the feature page.

**Acceptance:** route file < ~40 lines; no Kysely query definitions outside `src/core/modules`; payment flow works end-to-end (create payment on keypad → wait screen shows methods → QR renders); `bun run check` passes.

---

### Issue 13: Extract onboarding UI from the 640-line route; move payment-method-order serialization into the domain module

**Files:** `src/routes/onboarding.tsx` → `src/features/onboarding/`, `src/core/modules/app-settings/app-settings-utils.ts`

**Problem:** (a) All four wizard steps, the wizard chrome, and finish orchestration live in the route even though `src/features/onboarding/` exists (it holds only `onboarding-form-state.ts`). (b) `getPaymentMethodOrder`, `getDefaultPaymentMethodForOnboarding` (~lines 614–640) and the `JSON.stringify(...)` at ~line 253 encode the `paymentMethodOrderJson` **domain format**, whose parser `parsePaymentMethodOrder` lives in `app-settings-utils.ts` — serializer and parser are in different layers, so a format change requires remembering a route file. `getDefaultCurrencyForLanguage` (~133–145) is a similar domain mapping.

**Fix:**
1. Move order/default derivation + serialization into `app-settings-utils.ts` next to `parsePaymentMethodOrder` (matching its conventions; add tests mirroring the parser's tests if any exist). Alternatively have the `completeOnboarding` action accept the method set and encode internally — pick whichever fits the existing action signature better.
2. Move `getDefaultCurrencyForLanguage` into a sensible domain/domain-adjacent home (e.g. app-settings utils or the settings feature's options files).
3. Move the step components and wizard chrome to `src/features/onboarding/` (e.g. `language-step.tsx`, `account-step.tsx`, `payments-step.tsx`, `finish-step.tsx` or as actually named, plus `onboarding-page.tsx`); route becomes thin.
4. Use `useReloadAppEvolu()` from Issue 6 if it exists; otherwise leave the counter bump as-is (Issue 6 will sweep it).

**Also note (fix here if trivial):** `onboardingFormAtom` in `onboarding-form-state.ts` is app-global and only reset on *successful* completion — re-entering onboarding later resumes with stale step/IBAN. Reset the atom on wizard mount, or convert to `useReducer` inside the extracted page component.

**Acceptance:** `src/routes/onboarding.tsx` < ~40 lines; `JSON.stringify` of the method order and `parsePaymentMethodOrder` live in the same module; onboarding completes end-to-end on a fresh profile; `bun run check` passes.

---

### Issue 14: Extract the fio-plugin settings feature; remove the placeholder-id query hack by splitting create/edit forms

**Files:** `src/routes/_terminal.settings.fio-plugin.tsx` (493 lines) → `src/features/settings/fio-plugin/`

**Problem:** `FioPluginForm`, `FioPluginTokenList`, and `maskToken` are substantial feature UI in a route file. Additionally (~lines 66–68, 138–143) the form fabricates a fake row id to satisfy the rules of hooks:

```ts
const fioPluginFormPointerPlaceholderId = createIdFromString<"FioPlugin">(
  "payky-fio-plugin-form-pointer-placeholder")
...
fioPluginSyncPointerByPluginIdQuery(plugin?.id ?? fioPluginFormPointerPlaceholderId)
```

A sentinel id executed against the DB is a structural smell — the create and edit flows are one component pretending to be both.

**Fix:**
1. Move the UI to `src/features/settings/fio-plugin/` following the `security/` subdirectory precedent.
2. Split into `FioPluginCreateForm` (no pointer query at all) and `FioPluginEditForm` (receives a real `plugin` row, queries the pointer with its real id), with the parent choosing which to render. Delete the placeholder id.
3. Apply the Issue 5 hydration pattern (key by `plugin.id`, initialize state once) while splitting — the edit form currently mirrors the row via effect.

**Acceptance:** route file is thin; no `createIdFromString` placeholder in the feature; create and edit flows both work (add token, edit plugin, delete); `bun run check` passes.

---

### Issue 15: Extract payment-accounts settings feature; move Spark privacy logic into account Tasks

**Files:** `src/routes/_terminal.settings.payment-accounts.tsx` (552 lines) → `src/features/settings/payment-accounts/`, `src/core/modules/account/account-actions.ts`

**Problem:** (a) Three substantial forms live in the route file. (b) `SparkAccountForm` (~lines 310–349, 389–408) calls `createDefaultSparkPaymentWallet` directly — once in an effect to read `privacyMode` (constructing an entire wallet on every mnemonic change just to read a flag) and again inside submit to `setPrivacyEnabled`. Submit has mixed transaction semantics: `saveSparkAccount` succeeds, then the privacy save fails → account persisted but the form reports failure. AGENTS.md wraps Spark behind `SparkWalletDep` precisely so consumers go through Tasks.

**Fix:**
1. Add Tasks in `account-actions.ts` typed over `SparkWalletDep` (follow existing Spark-using Tasks for wallet acquisition/cleanup): e.g. `getSparkPrivacyMode({ mnemonic })` and `saveSparkAccountWithPrivacyMode({ ... })` that performs the account save and privacy update as one operation with a coherent error union (decide and document what happens when privacy-set fails after the account save — either roll forward with a distinct partial-failure error, or set privacy first).
2. Replace both direct wallet calls in the component with `useAppRun()` + these Tasks. Add a cancellation guard to the load path if kept as an effect.
3. Move the page UI to `src/features/settings/payment-accounts/` (route stays thin). Apply the Issue 5 hydration pattern to the three forms while moving.

**Acceptance:** `createDefaultSparkPaymentWallet` not imported by feature/route files (also required by Issue 10 for withdraw); saving a Spark account with privacy on/off round-trips correctly; partial-failure behavior is deliberate and reflected in the UI message; `bun run check` passes.

---

### Issue 16: Move payment-detail/payment-history out of `src/components`; unify triplicated payment-status derivation

**Files:** `src/components/payment-detail.tsx` (497 lines), `src/components/payment-history.tsx` → `src/features/activity/`; queries → `src/core/modules/payment/payment-queries.ts` and the module owning reconciliation claims; status logic → `src/core/modules/payment/payment-utils.ts`

**Problem:** Both are activity-feature page UI living in `src/components` (AGENTS.md: substantial page UI belongs in `src/features`, not `src/components`). `payment-detail.tsx` defines two read models inline including a 6-table join (`paymentReconciliationsQuery`); `payment-history.tsx` defines `latestPaymentsQuery`. Both derive `canceled | paid | pending` from `canceledAt` + claim presence with **duplicated but separately-maintained** logic, badge color classes, and two parallel translation-key families (`paymentHistory.status.*` vs `paymentDetail.status.*`) — while a third status vocabulary already exists in `PaymentStatusSchema` (`src/core/modules/shared/schema.ts`). Also `payment-detail.tsx` reuses `claimSourceLabelKey` for `transactionSource` labels — the two enums coincide today, but the `satisfies` check covers only one of them, so divergence would surface as a wrong runtime label, not a type error.

**Fix:**
1. Create `src/features/activity/` and move both components (their route consumers: `_terminal.activity.tsx`, `_terminal.activity_.$paymentId.tsx`).
2. Move the three queries into the owning modules' `*-queries.ts`.
3. Add one `resolvePaymentDisplayStatus` to `payment-utils.ts` returning a single exported display-status union; use it from both components. Consolidate the badge into a shared `PaymentStatusBadge` in the activity feature and collapse to one translation-key family (update en/cs/sk; remove dead keys).
4. Give `transactionSource` its own label map with its own `satisfies Record<TransactionSource, TranslationKey>` check.

**Acceptance:** `src/components/payment-detail.tsx` and `payment-history.tsx` no longer exist; no Kysely queries outside `src/core/modules`; one status-derivation function with a test; activity list and detail render as before; `bun run check` passes.

---

### Issue 17: Move `terminal-payment-keypad` to a feature; extract money parsing into the money module

**Files:** `src/components/terminal-payment-keypad.tsx` (484 lines) → `src/features/terminal/` (or another name consistent with the codebase — it is the `_terminal.index.tsx` page body), `src/core/modules/shared/money.ts`

**Problem:** (a) `TerminalPaymentKeypadSettingsLoader` queries Evolu app settings — feature data loading in `src/components`. (b) `createMoney` (~lines 87–101) converts a decimal string to minor units with float math (`Number(integerPart) * minorUnitsMultiplier`) — pure money domain logic that belongs next to `currencyFractionDigits` in the money module, with tests (9-digit amounts deserve them; consider integer/string arithmetic or `BigNumber` per AGENTS.md).

**Fix:**
1. Move the component file(s) to the feature dir; update imports in `_terminal.index.tsx`.
2. Move `createMoney` (and `formatAmountInput` if it is also pure) to `src/core/modules/shared/money.ts`; add unit tests covering fraction digits per currency, large amounts, and rounding edges.
3. Preserve the intentional patterns and add short comments so they survive future refactors: the per-mount `amountInputAtom` (`useMemo(() => atom(""))`) is a render-isolation trick, and the dual `isChargePendingRef` + state tracks synchronous re-entrancy vs UI.

**Acceptance:** keypad works (type amount, charge, navigates to payment wait); `createMoney` has tests; no Evolu queries under `src/components`; `bun run check` passes.

---

### Issue 18: Move donation settings UI to the feature; fix fiat↔sats conversion modeled as a derived-state effect

**Files:** `src/components/donation-history.tsx` → `src/features/settings/donations/`, `src/routes/_terminal.settings.donations.tsx` (342 lines — extract page UI to the same feature dir), conversion helpers → `src/core/modules/shared/money.ts`

**Problem:** (a) `donation-history.tsx` is settings-feature UI (all its keys are `settings.donations.history.*`; sole consumer is the donations route). (b) In the donations route (~lines 176–199) an effect depends on `fiatInput`, `satsInput`, `exchangeRate` and writes back into both inputs. Conversion is an *event* (user typed in one field) modeled as state synchronization: when the exchange-rate query refetches, the effect re-runs and rewrites whatever the user is typing (e.g. reformats `"1.50"` mid-edit). (c) `SATS_PER_BTC`, `convertFiatToSats`, `convertSatsToFiat`, `formatFiatInput` (~lines 43–87) are domain money logic in a route.

**Fix:**
1. Move the conversion into the `onChange` handlers: typing in fiat sets both fiat and sats; typing in sats sets both. Keep only `editedAmount: "fiat" | "sats"` as state to decide which field re-derives when the exchange rate changes (that one remaining rate-driven update may be an effect or render-time derivation — do not reformat the field the user last edited).
2. Move the conversion/formatting helpers to `src/core/modules/shared/money.ts` with tests.
3. Move `donation-history.tsx` and the extracted page UI into `src/features/settings/donations/`.
4. While there: replace hardcoded DOM ids `"donation-fiat"`/`"donation-sats"` (~lines 239, 258) with `useId()`, matching every other form in the app.

**Acceptance:** typing in either field is never rewritten by a rate refetch mid-edit; helpers tested; route thin; `bun run check` passes.

---

### Issue 19: Account management — dead pending state, inline device-account logic duplicated with onboarding

**Files:** `src/routes/_terminal.settings.accounts.tsx` (295 lines) → `src/features/settings/accounts/`, new hook (location per step 2), `src/routes/onboarding.tsx` (or `src/features/onboarding/` after Issue 13)

**Problem:** (a) `activateAccount` (~78–90) and `removeAccount` (~92–103) set `pendingAccountId`/`removingAccountId` and clear them in the same synchronous block — `selectAccount`/`removeDeviceAccount` are synchronous (`src/core/evolu/device-account.ts` ~244, 267), so this state never renders and only feeds an aggregate `pending` flag misleadingly. (b) Components call `useAtomValue(deviceEvoluAtom)` then `selectAccount(deviceEvolu, ...)`/`updateAccountName(...)` + `runMutationWithCompletion` directly (~line 54 here, ~517 in onboarding) — AGENTS.md says access Evolu from React through hooks. The onboarding name-save logic (~523–542) is a near-duplicate of what account settings needs.

**Fix:**
1. Remove the fake pending/removing states (or make the operations genuinely async with real pending UI — removing is simpler and honest).
2. Add a `useDeviceAccountActions()` hook exposing `rename`, `select`, `create`, `restore`, `remove` — encapsulating the device-Evolu handle, `runMutationWithCompletion` where needed, and the app-Evolu reload (use `useReloadAppEvolu` from Issue 6). Place it in `src/hooks/` (it wraps a device singleton, matching that directory's charter).
3. Use the hook from both the accounts page and onboarding's account step.
4. Move the page UI (~250 lines of list + forms) to `src/features/settings/accounts/`.

**Acceptance:** no component reads `deviceEvoluAtom` to perform account mutations directly; account switch/rename/remove/restore still work and the app client reloads on switch; `bun run check` passes.

---

## P4 — Smaller cleanups

### Issue 20: Delete dead `src/providers/evolu.tsx`

**Files:** `src/providers/evolu.tsx`

**Problem:** The file defines a context-based Evolu binding (`createEvoluBinding(AppSchema)`, `AppProviders`, `EvoluContext`, its own `useQuery`) with **zero imports anywhere** in `src/` or `bin/` (verified by grep). It is a second, contradictory way to access Evolu alongside the sanctioned atoms+hooks path, and AGENTS.md's structure section doesn't mention `src/providers` at all. Dead alternative composition roots are how future contributors pick the wrong pattern.

**Fix:** delete the file; delete `src/providers/` if it becomes empty. Confirm with `grep -rn "providers/evolu" src bin` that nothing references it.

**Acceptance:** file removed; `bun run check` passes.

---

### Issue 21: Root `<Suspense fallback={null}>` blanks the whole app during query suspension

**Files:** `src/App.tsx` (~line 20), `src/main.tsx` (~lines 15–39, the `#app-loader` teardown), optionally per-route `pendingComponent`s

**Problem:** Every `useEvoluQuery` suspends via `use(loadQuery)`, so the first visit to any querying route bubbles to the single root boundary and renders a blank screen (only `_terminal.index.tsx` adds a local boundary). Related race: `AppWithLoaderCleanup` hides the HTML `#app-loader` on first commit, but the Suspense child may still be suspended — the loader fades out over a blank screen.

**Fix:**
1. Replace `fallback={null}` with a minimal branded loading view (reuse the spinner pattern from `restore-account.tsx`; add translation keys only if text is shown).
2. Move the `#app-loader` teardown into a component rendered *inside* the Suspense boundary (a child that renders null and hides the loader in its effect) so the HTML loader persists until the real UI has actually mounted.
3. Optionally add local `Suspense`/`pendingComponent` to the heaviest feature pages so navigation chrome stays visible; keep this minimal.

**Acceptance:** hard-reload on a settings page shows the HTML loader → app UI with no blank flash between them; `bun run check` passes.

---

### Issue 22: Error fallback depends on the stack it is protecting

**Files:** `src/components/error-boundary.tsx` (~line 27)

**Problem:** `AppErrorBoundary` (a TanStack `errorComponent` fallback) calls `useTranslation()`, which suspends on `useDeviceSettings` → device Evolu. If the crash originates in device-Evolu init (corrupted SQLite/OPFS — a realistic failure class for a local-first app), the error view itself throws/suspends → blank screen instead of a recovery UI.

**Fix:** make the fallback self-contained. Read translations synchronously and best-effort — e.g. import the `resources`/`en` table directly and try `navigator.language` matching without touching Evolu — and wrap any remaining risky calls so failure degrades to static English strings (framework-boundary exception per AGENTS.md). Keep the error detail formatting.

**Acceptance:** simulate the failure by making `useTranslation` throw inside the fallback (temporarily) — the error view still renders; restore and `bun run check` passes.

---

### Issue 23: Inconsistent handling of failed fire-and-forget actions; floating promises in `onChange`

**Files:** `src/routes/_terminal.settings.fiat.tsx` (~lines 84–88), `src/routes/_terminal.index.tsx` (~lines 96–99), `src/features/settings/security/transport-toggle-list.tsx` (~lines 79, 139), `src/features/settings/option-toggle-group.tsx` (type only, if needed)

**Problem:** Three conventions coexist: fiat setting ignores the action `Result` entirely (failed save = toggle silently snaps back on next read, no feedback) and passes an `async` handler into an `onChange: (value) => void` slot (floating promise); the keypad charge path logs `console.error` only (user taps charge, nothing happens); withdraw/transports do proper translated errors. `transport-toggle-list.tsx` has the same floating-promise shape (`onToggle` async, called unawaited).

**Fix:**
1. Pick the baseline: on non-ok `Result` from a fire-and-forget settings action, show `toast.error(t("..."))` (sonner is already wired). Add a generic failure key (e.g. `settings.saveFailed`) to en/cs/sk unless a suitable key exists.
2. Apply to the fiat page and the keypad charge failure path (`_terminal.index.tsx` — replace/augment the `console.error`; note AGENTS.md forbids global console in Task code, and here a user-visible toast is required regardless).
3. Fix the floating promises: make the handlers `void`-wrapped with internal error handling (`onChange={(v) => { void handle(v) }}` where `handle` catches/reports), or widen the callback types to `(value) => void | Promise<void>` and handle rejections at the call site — follow whichever pattern biome's rules push toward.
4. Optional (small): the fiat/theme/language/default-payment-method pages are all the same "card + OptionToggleGroup + save-on-select" shape; if trivial, align fiat with the `useSettingsForm`-based saved-message pattern used by `_terminal.settings.default-payment-method.tsx`. Do not build a new abstraction just for this.

**Acceptance:** failing `updateSettings` (simulate with a temporary `err` return) produces visible feedback on the fiat page; charge failure shows feedback; no unhandled-rejection paths in the touched handlers; `bun run check` passes.

---

### Issue 24: Fiat-currency option list duplicated 3× (with inconsistent ordering)

**Files:** `src/routes/_terminal.settings.fiat.tsx` (~38–54), `src/routes/onboarding.tsx` (~113–129), `src/routes/_terminal.settings.payment-accounts.tsx` (~67–81); new `src/features/settings/fiat-currency-options.ts`

**Problem:** Three hand-maintained `FiatCurrency → settings.fiat.*.title` mappings, in two different orders (EUR/USD/CZK vs USD/EUR/CZK). Adding a currency requires finding three files. The codebase already has the precedent: `src/features/settings/language-options.ts`.

**Fix:** create `fiat-currency-options.ts` mirroring `language-options.ts` (one exported readonly list; use `satisfies` so a new `FiatCurrency` member forces an update). Decide one canonical order (match the current fiat-settings page). Replace all three inline lists.

**Acceptance:** one definition, three consumers; `bun run check` passes.

---

### Issue 25: Copy-to-clipboard QR block duplicated

**Files:** `src/routes/_terminal.payment_.$paymentId.tsx` (`QrPaymentRequest`, ~847–879), `src/routes/_terminal.settings.donations-invoice.tsx` (~136–145); new `src/components/copyable-qr-code.tsx`

**Problem:** Byte-identical ~300-char `className` and the same `navigator.clipboard.writeText` + success/error toast pattern in two places.

**Fix:** extract a generic `CopyableQrCode` component (no domain logic → `src/components/` per AGENTS.md) with props `value`, `copiedMessage`, `copyFailedMessage`, `aria-label` (all translation-resolved strings passed in by callers, so the component stays i18n-agnostic). Replace both usages. If Issue 12 has moved the payment page, update the import there instead.

**Acceptance:** both QR blocks render and copy as before; one implementation; `bun run check` passes.

---

### Issue 26: Theme-provider — global "d" hotkey in a payment terminal, plus small cleanups

**Files:** `src/components/theme-provider.tsx`

**Problem:** (a) ~lines 129–164: a global `keydown` listener toggles theme on the bare key "d" — in a payment terminal any stray keypress outside an input flips the theme; it is undocumented and partially overlaps the terminal keypad's own global keydown handler. (b) ~line 175: `{...props}` is always empty after destructuring — dead spread. (c) `type ThemeProviderProps` lacks `readonly` fields, contrary to repo conventions.

**Fix:** gate the hotkey behind `import.meta.env.DEV` (or delete it — check git history/ask in the PR if unsure; gating is the safe default). Remove the dead spread. Add `readonly` to the props type. The direct device-settings write here is Issue 7 — skip it if Issue 7 is open, otherwise leave as is.

**Acceptance:** pressing "d" in a production build does nothing; theme toggle in settings still works; `bun run check` passes.

---

### Issue 27: Misnamed/typo'd component files — `vertial-nav.tsx`, `skeleton.tsx`

**Files:** `src/components/vertial-nav.tsx`, `src/components/skeleton.tsx`, all importers (5+ files)

**Problem:** (a) `vertial-nav.tsx` is a typo for "vertical". (b) `skeleton.tsx` contains no skeleton loader — it holds `PhoneViewport` (app viewport layout) and `HeaderStartLink` (header back/close button); anyone looking for a standard shadcn skeleton primitive finds this. It also owns `export type VerticalNavItem = ComponentProps<typeof VerticalNav>["items"][number]`, which belongs next to `VerticalNav`.

**Fix:** rename `vertial-nav.tsx` → `vertical-nav.tsx`; split `skeleton.tsx` into `phone-viewport.tsx` and `header-start-link.tsx`; move the `VerticalNavItem` type into `vertical-nav.tsx`. Update all imports (grep for `vertial-nav`, `from "@/components/skeleton"` / relative equivalents). Purely mechanical — no behavior change.

**Acceptance:** no file named `vertial-nav.tsx` or `skeleton.tsx` under `src/components`; `bun run check` passes.

---

### Issue 28: `VerticalNav` empty state smuggled through a `[false]` sentinel item

**Files:** `src/components/vertial-nav.tsx` (or `vertical-nav.tsx` after Issue 27), `src/components/payment-history.tsx` (~line 98), `src/components/donation-history.tsx` (~line 39) (paths change if Issues 16/18 landed)

**Problem:** Both history lists express "empty/loading" as `const navItems = items.length === 0 ? ([false] as const) : items` — a fake disabled nav item whose `label` is an entire empty-state layout. Also `items: NavItem[]` should be `ReadonlyArray<NavItem>` per repo TS rules.

**Fix:** add an `empty?: ReactNode` prop to `VerticalNav` rendered when `items` is empty (or have callers render the empty state as a sibling — pick whichever keeps markup/styling identical). Remove the `[false]` sentinels. Change `items` to `ReadonlyArray<NavItem>`.

**Acceptance:** empty activity and empty donation history render identically to before (compare markup); no `[false]` sentinel; `bun run check` passes.

---

### Issue 29: `password-textarea` — hardcoded aria-label strings; misc nits

**Files:** `src/components/password-textarea.tsx` (~line 42), `src/i18n/en.ts`, `cs.ts`, `sk.ts`

**Problem:** `aria-label={showPassword ? "Hide content" : "Show content"}` violates "Never hardcode user-facing text" (screen-reader text is user-facing). Nits: `forwardRef` is unnecessary on React 19 (ref is a normal prop); empty `interface PasswordTextareaProps extends ... {}`.

**Fix:** the component should stay i18n-agnostic if it might move to `ui/` — simplest compliant approach: accept `hideLabel`/`showLabel` props and let callers pass `t(...)` values, OR call `useTranslation()` directly with new keys (e.g. `passwordTextarea.show`/`passwordTextarea.hide`) since it already lives in `src/components`. Pick one; add keys to all three languages if using `t`. Optionally drop `forwardRef` and the empty interface while touching the file.

**Acceptance:** no hardcoded English in the component; screen-reader label translated (or caller-supplied); `bun run check` passes.

---

### Issue 30: `payment-success.tsx` — raw colors bypass the theme; name implies domain coupling it doesn't have

**Files:** `src/components/payment-success.tsx` (~line 15), its consumers (payment page, `_terminal.settings.donations-invoice.tsx` ~102, `src/features/withdraw/withdraw-page.tsx`)

**Problem:** `bg-green-500 text-[#071012]` bypasses semantic theme tokens (the rest of the app uses `text-success`, `bg-success/10`); a raw hex won't adapt to theme changes. The component is actually a fully generic "big check + title + description + actions" panel used by payments, donations, and withdraw — the `payment-` prefix falsely implies domain coupling.

**Fix:** replace with semantic tokens (`bg-success text-success-foreground` — add the token(s) in `src/index.css` if missing, matching how existing success tokens are defined). Rename to something generic (e.g. `success-panel.tsx` / `SuccessPanel`) and update the three consumers.

**Acceptance:** success screens look correct in both light and dark themes; no raw hex/green-500 in the component; `bun run check` passes.

---

### Issue 31: `fade-header.tsx` scroll-effect nits

**Files:** `src/components/fade-header.tsx` (~lines 15–31)

**Problem:** (a) the scroll handler is never invoked on mount, so a page restored mid-scroll renders the header fully opaque until the first scroll event; (b) the comment says "after scrolling 300px" but `fadeDistance = 75`; (c) the listener isn't `{ passive: true }`.

**Fix:** call the handler once inside the effect after attaching; fix or delete the stale comment; add `{ passive: true }` to `addEventListener` (mirror in `removeEventListener` options as required). The direct DOM style mutation is a deliberate perf choice — keep it.

**Acceptance:** `bun run check` passes; header opacity correct when mounting mid-scroll.

---

### Issue 32: Wake-lock effect duplicated across routes

**Files:** `src/routes/_terminal.index.tsx` (~104–112), `src/routes/_terminal.checkout.tsx` (~70–78); new `src/hooks/use-wake-lock.ts`

**Problem:** Identical request-on-mount/release-on-unmount effect blocks in two routes (and the payment page has related wake-lock logic — check while there). If the underlying `requestWakeLock`/`releaseWakeLock` functions have unstable identities, the deps array churns the lock every render — verify and stabilize.

**Fix:** extract `useWakeLockWhileMounted()` into `src/hooks/`, encapsulating request, release, and error tolerance. Replace both call sites (and the payment page's, if identical in behavior — if it has extra conditions, leave it for Issue 12).

**Acceptance:** screen stays awake on keypad and checkout as before; one implementation; `bun run check` passes.

---

### Issue 33: Dead placeholder UI shipped in settings index; `useMemo` ceremony

**Files:** `src/routes/_terminal.settings.index.tsx` (~46–63, 234–238)

**Problem:** `terminalSettings` rows without `to` (tips, baskets) are rendered inside a `className="hidden"` `VerticalNav` — dead placeholder UI with live translation keys shipped to production. The 8 `useMemo(..., [t])` wrappers around static arrays are ceremony with no measurable benefit.

**Fix:** remove the hidden nav and the unused rows (keep the translation keys only if another surface uses them — grep; otherwise remove from en/cs/sk). Optionally drop the pointless `useMemo`s while there (plain `const` in render is fine for these sizes).

**Acceptance:** settings index renders the same visible items; no `className="hidden"` nav; unused keys removed from all three language files (the `satisfies` check will catch stragglers); `bun run check` passes.

---

### Issue 34: `@faker-js/faker` in the production bundle to generate one device name

**Files:** `src/atoms/account.ts` (~lines 2, 39), `package.json`

**Problem:** `faker.internet.username()` pulls the large faker library into the app-boot path of a mobile terminal app, to produce one random display name.

**Fix:** replace with a tiny local generator (e.g. a ~30-word adjective+noun list + random suffix) in an appropriate shared/util module. Check whether anything else imports faker in `src/` (tests may keep it — check `package.json` placement; if it's only needed by tests, move it to `devDependencies`).

**Acceptance:** no `@faker-js/faker` import under `src/` outside test files; new-device bootstrap still produces a readable name; `bun run check` passes; bundle size drop visible in `bun run build` output (report the numbers in the PR).

---

### Issue 35: Withdraw — pass `deviceId` when executing a withdrawal (attribution parity with payments)

**Files:** `src/features/withdraw/withdraw-page.tsx` (~256–266), reference: `src/routes/_terminal.index.tsx` (~74–86), `src/core/modules/withdrawal/withdrawal-actions.ts` (~147)

**Problem:** `executeWithdrawal` accepts `deviceId?: DeviceId | null` but the page never passes it, so withdrawal transactions record `deviceId: null` while payments attribute the device via `accountAtom`. Activity/audit attribution is inconsistent.

**Fix:** obtain the device id the same way the keypad does (via the account atom / whatever hook exposes it) and pass it to `executeWithdrawal`. Small, surgical change.

**Acceptance:** a new withdrawal row records the device id (verify via the activity detail or a quick query); `bun run check` passes.

---

## Suggested order of work

1. Issues 1–4 (bugs) — independent of each other, safe to parallelize.
2. Issue 6 (reload hook) — unblocks cleaner versions of 13 and 19.
3. Issue 5 (form hydration) — or fold per-file into 14/15 if those run first; don't do both blindly (coordinate).
4. Issues 9–19 (refactors) — Issue 2 before 9; Issue 12 supersedes 3's temporary location; 16/18 change file paths referenced by 28.
5. Issues 20–35 in any order (20, 24, 27 are the quickest wins).

Dependencies/conflicts recap: 3↔12 (same file), 2→9, 5↔14/15 (same files), 6→13/19, 7↔26 (theme-provider), 16/18→28 (moved paths), 12→25/32 (payment page code moves).
