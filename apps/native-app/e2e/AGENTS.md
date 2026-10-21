# Native E2E (Maestro)

Conventions for `apps/native-app/e2e/`. The root `AGENTS.md` still applies.
These flows port `apps/web-app/e2e/*.spec.ts` to the native app; read the web
spec and its `support/` helpers before porting one, and keep the same business
assertions.

## Running

- `bun run test:e2e:native:web` / `bun run test:e2e:native:android` (root), or
  `bun run --cwd apps/native-app test:e2e -- --platform web|android [--build]
  [--dev] [e2e/flows/x/y.yaml ...]`. Not part of `bun run check`.
- Needs Maestro 2.11.0 (`curl -Ls https://get.maestro.mobile.dev |
  MAESTRO_VERSION=2.11.0 bash`, lands in `~/.maestro/bin`) and Java 17+.
- The runner builds the e2e app when it is missing or with `--build`, always
  with `EXPO_PUBLIC_PAYKY_E2E=1`: web is an `expo export` in
  `.generated/web` served on `127.0.0.1:8790`, Android a release APK for the
  device's ABI in `.generated/app-e2e.apk`. Rebuild after app changes.
- Android `--dev` is the quick loop: a debug APK (`.generated/app-e2e-debug.apk`,
  rebuilt only with `--build`, i.e. after native changes) loads its JS from an
  e2e Metro on port 8792 (8081 may be a developer's own Metro without the e2e
  switch), so a JS change needs no rebuild. The flows launch it through
  `subflows/launch.yaml` with a dev-client link that keeps the dev menu away;
  an emulator reaches Metro at `10.0.2.2`. Release builds stay the reference
  (CI); run them before calling a batch green.
- Android runs on an emulator only (the first `emulator-*` in `adb devices`)
  unless `ANDROID_SERIAL` names a device. The e2e APK replaces any installed
  `me.payky.nativepreview` and its data — never point it at someone's phone
  without asking.
- JUnit and screenshots land in `.generated/report/` (gitignored).

## How a flow is built

- One flow per web test in `flows/<area>/<name>.yaml`, named after it. Header
  is always `appId: ${APP_ID}` plus `tags: [<area>]`; the runner sets
  `APP_ID`/`BASE_URL` per platform and, for web, wraps the body in a
  generated `url:` flow. A flow for one platform only adds `android-only`,
  `web-only` or `ios-only`; a step for one platform uses
  `runFlow: { when: { platform: Android }, ... }`.
- The first step is exactly one of `subflows/start.yaml` (fresh app, strings
  loaded) or `subflows/seed-onboarding.yaml` (web's `seededPage`: fresh app,
  onboarded by the bridge, English, on the terminal home). Never start twice
  in one flow: on web a second `clearState` with the page open hangs the app
  on its splash. Each web flow runs in its own Maestro invocation because
  `clearState` does not clear OPFS there.
- Copy comes from the translations: `${output.t["pay.request"]}`, templated
  strings `'${output.tv("bill.itemsCount", { value: 3 })}'` (quote it for
  YAML). `src/e2e/e2e-strings.test.ts` fails on a key `en` does not have.
  Text selectors are regexes that also match literally.
- Subflows (env in brackets) replace web's `support/` helpers:
  `goto` (`ROUTE`, `TEXT`) is `gotoPage`; `e2e-action` (`ACTION`, `QUERY`)
  runs a bridge action and waits for `E2E OK`; `complete-onboarding` is
  `completeOnboarding` through the real UI; `scroll-to-label` (`LABEL`/`PATTERN`) scrolls to what `tap-label` taps; `tap-label` (`LABEL`) taps a
  kit Button or icon button by its label (or a regex `PATTERN`, "Bill #\\d+");
  `tap-input`, `clear-input`,
  `fill-input` (`LABEL`, `VALUE`) work an input by its field label
  (`type-input` types into an empty one: `clear-input` reads a placeholder
  as text); `assert-label` (`LABEL`) waits for a control by its label;
  `fill-inline` is `fillInlineField` (type, Save, wait for "Saved"); `tap-id`
  taps a control by testID; `relaunch` (`TEXT`) is `reloadPage`;
  `reopen` (`ROUTE`, `TEXT`) is `relaunch` then `goto`, to check a change survived;
  `turn-on-access` (`PIN`, `PRESET`, `KEEP`, `IN_APP`) is `turnOnAccessControl` (it restarts the app to end the PIN session unless `KEEP: "true"`), `type-pin` (`PIN`, 4 digits) is `typePin`, `wrong-pins` five wrong ones, `open-settings-entry` (`TITLE`, `FROM_HOME`) is `openSettingsEntry`, `assert-prompt` (`ACTION`) waits for the one-shot PIN prompt, `open-locked-settings` reaches the PIN screen for Settings in-app (Home → gear → Items), `read-phrase` keeps the recovery phrase as `output.phrase`; `enter-amount` (`AMOUNT`, `<` = backspace) is `enterAmount`;
  `assert-checked` (`LABEL`, `CHECKED`) checks a switch, on Android only;
  `add-catalog-item`, `add-category`, `add-table` are web's `addCatalogItem`,
  `addCatalogCategory`, `addTable`; `start-new-bill` is `startNewBill`,
  `new-bill` the same from the tables home; `charge-cash` pays the open bill
  in cash and returns home; `read-ids` is web's `new URL(page.url())` for
  ids: the newest bill's and payment's ids as `output.billId` and
  `output.paymentId` (it leaves the app on the bridge page, so `goto` next);
  `add-tax-rate` is `addTaxRate`; `park-cart` is tables-overview's
  `parkCart`; `merge-scenario` is bill-split's `setupMergeScenario`;
  `to-tip-step` enters 5.9 and opens the tip step; `mark-cash-paid` is
  `markCashPaid`; `open-country-select` opens the legal entity's empty
  country select; `inject-scan` (`CODE`) is `injectScanCode`, the camera
  decoding a code: it opens the newest unfinished bill (a new cart when none
  has a row yet) with the code, as the home screen's hardware scan does, so
  scan mode need not be on and no `E2E OK` is waited for — assert the bill's
  outcome after it. It does not reach the item form or list, whose scans
  come from hardware keys only. `enable-cashu` (`MODE`) puts the Cashu wallet on the
  in-app fake mint and turns Cashu on (see the bridge's `fake`);
  `fund-cashu-wallet` takes a Cashu payment and walks to a new Cashu
  withdrawal, by taps only.
  `open-spark-wallet-dialog`, `type-spark-mnemonic`
  (`MNEMONIC`, into the dialog's masked field, not the page's twin behind it),
  `assert-spark-phrase` (`PHRASE`, restarts and reveals the wallet's phrase) and
  `assert-spark-switch-disabled` (Android only) are settings-spark-wallet's
  helpers; `read-invoice` keeps a fresh 1 000-sat Lightning invoice (the
  `lightningInvoice` action) as `output.invoice`, leaving the app on the
  bridge page. The funded fake Spark wallet: open
  `${BASE_URL}e2e/fake?spark=funded&next=/` and wait for home (`next=`
  replaces the bridge, so there is no `E2E OK`); a later link reloads web
  and drops it, so take links (ids, invoices) before it.
- Optional env: `fill-input`/`fill-inline`/`clear-input` take `PLACEHOLDER`
  (an emptied input with one shows it as its text), `fill-input`/
  `fill-inline`/`tap-input` take `BUTTONS: "true"` for an inline field that
  opens already editing (its Save/Discard cover the input's right end),
  `assert-checked` takes `BY_TEXT: "true"` for a toggle-group option (no
  testID). An optional value passed on to another subflow uses `""` for none.

## The bridge

- Maestro cannot call into the app, so web's `window.__e2e*` functions are
  actions in `src/e2e/e2e-actions.ts`, run by opening `/e2e/<action>?<params>`
  (`app/e2e/[action].tsx`, `free` in `route-access.ts`). The page prints
  `E2E OK <action> [value]` or `E2E FAIL <action>: <message>` in
  `testID="e2e-result"`. Without `EXPO_PUBLIC_PAYKY_E2E` it redirects home.
- Port a web bridge function as an action with its doc comment; params are
  strings, parsed with zod. Opening the same action URL twice in a row is
  not guaranteed to rerun it — navigate elsewhere in between. `next=<path>`
  moves on to that screen in-app after a successful action (web reloads on
  every link, losing in-memory state).
- `fake` swaps in outside services until the app restarts, so run it after
  `seed-onboarding` and, on web, move on with `next=`: `spark=funded`
  (`e2e-spark-presets.ts`), `cashu=manual|autopay` (`e2e-cashu-mint.ts`, web's
  `__e2eCashuMint`: an in-app fake mint and no Linky sync; set it before the
  Cashu wallet first starts). `cashuPayQuotes` is web's
  `__e2eCashuPayQuotes` and prints how many quotes it paid; a web link
  reloads the page and loses the mint, so flows use `cashu=autopay` instead,
  which pays open quotes every 4 s by itself.

## Selectors

1. Visible translated text.
2. An accessibility label (icon-only buttons): text on Android, but `id:` on
   web (Maestro's web driver reads `aria-label` as an id, not as text), so
   branch on the platform. A missing label is an app bug — fix the app.
3. `id:` = `testID`, only where web uses `data-testid` (same string), or where
   there is no stable text. Every web `data-testid` whose screen native has
   is already mirrored (native-e2e.md, 3.3). On web `id:` reads an element's
   aria-label before its testID, so a testID only works there on an element
   without a label (`table-tile` sits on the unlabeled wrapper, as on web).

4. Inputs: `tap-input`/`fill-input`. A kit input's field label is also its
   aria-label and testID, so `id: <label>` finds it on both platforms (a text
   selector on Android also hits the FieldLabel above it).

`id:` selectors are regexes with no literal fallback: wrap copy in
`output.re(...)` ("Bank account (optional)"). Text selectors fall back to a
literal match, but `output.re` does no harm there either. On Android a text
selector matches `text`, the hint and the content-desc alike.

Never coordinates, index-only selectors, or sleeps; wait with
`extendedWaitUntil` on something visible.

## Gotchas

- The PIN pad's OK is disabled until four digits are typed and Maestro does not see it; wait for the lock's heading (`access.pin.why.route`) instead. A PIN or recovery phrase input hides its text, so `fill-input`'s check-back fails: `tap-input` + `inputText`.

- Typing into inputs: `eraseText` deletes backwards from the cursor on both
  platforms, so `tap-input` taps near the input's right end; typing right
  after an erase on Android races React Native's controlled value, so
  `clear-input` waits for the field to be empty. Use `fill-input`, not a bare
  `eraseText` + `inputText`.
- After typing on Android the keyboard is up, and the next tap elsewhere may
  only close it: put `hideKeyboard` (in an Android-only `runFlow`) first —
  but only where the keyboard is surely up: without one, `hideKeyboard`
  presses Back and leaves the screen.
- Maestro has no "within": a tile or row's own text is told apart by
  position (`below:`/`above:`/`leftOf:`/`rightOf:` a neighbouring label), or
  by deterministic names (bills are numbered #1, #2, ... in creation order).
- Maestro's web driver ignores opacity and `aria-hidden`, and reports no
  checked state; such checks run on Android only (`when: platform: Android`),
  next to a web-visible assertion where there is one.
- `checked:` and `point:` take no `${}` values; branch with `when: true:`.
- A subflow's own header `env:` overrides what the caller passes, so optional
  env gets no header default: read it as `${typeof X === "undefined" ? ... : X}`.
  Quote a value holding `: ` (YAML), and run a changed flow once: a parse
  error fails the whole Maestro run before any flow starts.
- Text and ids match screens mounted under the current one too (Android
  keeps them): kit inputs, switches and checkboxes take their name as
  testID, so `tap-id`/`tap-input` hit only them.
- `seed-onboarding` relaunches after seeding: the bridge opened over
  onboarding leaves onboarding mounted underneath, and it sends the app home
  on every later settings write.
- RN maps `aria-label` only on View-based components: RN's `Switch` needs
  `accessibilityLabel` (`ui/switch.tsx`).
- Maestro's web driver scrolls only `window` and re-finds the focused input
  through an index-less XPath; in an e2e build `src/e2e/e2e-setup.web.ts`
  makes both work with React Native Web (an inner ScrollView, sibling inputs
  sharing classes). Its native twin mutes LogBox.
- `childOf` does not work on Android for a view with a testID: UIAutomator
  lists its children under another parent.
- A Save button sharing its copy with the page title ("Add item"): select it
  with `below:` the last input.
- Tamagui 3 on web drops `accessibilityLabel`/`accessibilityRole` into the DOM
  as dead attributes; use `aria-label`/`role`/`aria-*` in app code so web gets
  them too.
