# Native E2E (Maestro)

Conventions for `apps/native-app/e2e/`. The root `AGENTS.md` still applies.
These flows port `apps/web-app/e2e/*.spec.ts` to the native app; read the web
spec and its `support/` helpers before porting one, and keep the same business
assertions.

## Running

- `bun run test:e2e:native:web` / `bun run test:e2e:native:android` (root), or
  `bun run --cwd apps/native-app test:e2e -- --platform web|android [--build]
  [e2e/flows/x/y.yaml ...]`. Not part of `bun run check`.
- Needs Maestro 2.11.0 (`curl -Ls https://get.maestro.mobile.dev |
  MAESTRO_VERSION=2.11.0 bash`, lands in `~/.maestro/bin`) and Java 17+.
- The runner builds the e2e app when it is missing or with `--build`, always
  with `EXPO_PUBLIC_PAYKY_E2E=1`: web is an `expo export` in
  `.generated/web` served on `127.0.0.1:8790`, Android a release APK for the
  device's ABI in `.generated/app-e2e.apk`. Rebuild after app changes.
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
  `completeOnboarding` through the real UI; `tap-label` (`LABEL`) taps a
  kit Button or icon button by its label; `tap-input`, `clear-input`,
  `fill-input` (`LABEL`, `VALUE`) work an input by its field label;
  `fill-inline` is `fillInlineField` (type, Save, wait for "Saved"); `tap-id`
  taps a control by testID; `relaunch` (`TEXT`) is `reloadPage`;
  `enter-amount` (`AMOUNT`, `<` = backspace) is `enterAmount`;
  `assert-checked` (`LABEL`, `CHECKED`) checks a switch, on Android only.

## The bridge

- Maestro cannot call into the app, so web's `window.__e2e*` functions are
  actions in `src/e2e/e2e-actions.ts`, run by opening `/e2e/<action>?<params>`
  (`app/e2e/[action].tsx`, `free` in `route-access.ts`). The page prints
  `E2E OK <action> [value]` or `E2E FAIL <action>: <message>` in
  `testID="e2e-result"`. Without `EXPO_PUBLIC_PAYKY_E2E` it redirects home.
- Port a web bridge function as an action with its doc comment; params are
  strings, parsed with zod. Opening the same action URL twice in a row is
  not guaranteed to rerun it — navigate elsewhere in between.

## Selectors

1. Visible translated text.
2. An accessibility label (icon-only buttons): text on Android, but `id:` on
   web (Maestro's web driver reads `aria-label` as an id, not as text), so
   branch on the platform. A missing label is an app bug — fix the app.
3. `id:` = `testID`, only where web uses `data-testid` (same string), or where
   there is no stable text. Works on both platforms when the element has no
   label.

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

- Typing into inputs: `eraseText` deletes backwards from the cursor on both
  platforms, so `tap-input` taps near the input's right end; typing right
  after an erase on Android races React Native's controlled value, so
  `clear-input` waits for the field to be empty. Use `fill-input`, not a bare
  `eraseText` + `inputText`.
- After typing on Android the keyboard is up, and the next tap elsewhere may
  only close it: put `hideKeyboard` (in an Android-only `runFlow`) first.
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
- Tamagui 3 on web drops `accessibilityLabel`/`accessibilityRole` into the DOM
  as dead attributes; use `aria-label`/`role`/`aria-*` in app code so web gets
  them too.
