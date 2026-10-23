# Qerko terminál jako nová platební metoda (`paymentQerkoTerminal`)

## Kontext

Payky dnes umí kartu jen přes SwitchioPay (Android intent, `paymentCardSwitchio`). Qerko POS API (`/api/v4/pos`, sandbox `https://sandbox.qerko.com/api/v4/pos`) umožňuje řídit externí platební terminál vzdáleně přes HTTP: spustit platbu, pollovat stav, zrušit čekající platbu a udělat refund. API povoluje CORS (`access-control-allow-origin: *`), takže na rozdíl od Switchio a Fio funguje i v PWA, nejen v nativní aplikaci.

Cíl: nová metoda s průvodcem párováním (IČO a země → `/request-pairing` → kód z e-mailu → `/confirm-pairing` → API klíč uložený v tabulce `qerkoPlugin`, obdobně jako `fioPlugin`), placení na terminálu z obrazovky čekání na platbu, zrušení čekající platby a refund na kartu. Pokryje web-app i native-app.

Rozhodnutí od uživatele:
- **Rozsah:** platba, zrušení čekající platby (`/cancel-terminal-payment`) a refund na kartu. Reversal ani uzávěrka nebudou.
- **Terminál** se vybírá **per zařízení** (device DB). API klíč se sdílí synchronizovaně přes `qerkoPlugin`.
- **Web i native.**
- Do account transaction se zapisuje **`chargedAmount`**, ne `payment.amount`. Dýško přidané na terminálu se tak projeví jako přeplatek přes stávající coverage logiku.

## Architektura

### 1. Integrační klient: `packages/core/src/integrations/qerko/qerko-client.ts`
- Typ závislosti „config dep + Task funkce“, šablonou je `yadio-client.ts`:
  - `QerkoApiDep { qerkoApi: { posId } }` a `createQerkoApiDep({ posId })`. Prostředí (`production` | `sandbox`) není v závislosti, ale je součástí přihlašovacích údajů každého volání (`QerkoCredentials { apiKey, environment }`); `qerkoBaseUrls` z něj odvodí URL.
  - Pairing volání autentizuje jen hlavička `Pos-Id` (ověřeno proti sandboxu), terminálová navíc bearer API klíč.
  - API klíč se předává do každého Tasku jako parametr. Čte se z `qerkoPlugin` ve chvíli volání, takže závislost nemusí znát účet.
- Všechny metody jsou `POST` s JSON tělem a hlavičkami `Pos-Id` a `Authorization: Bearer`. Volání jde přes `fetchAndValidateJson` / `appFetchAsJson` a `validateJsonResponse` z `packages/core/src/deps.ts`.
- Odpovědi validuje Zod přes discriminated union nad polem `type`, payment podle `status`.
  - HTTP chyby: `defineError("QerkoHttpError")<{status, responseBody}>` (401, 400).
  - Chyby tvaru odpovědi: `QerkoApiError`.
- Tasky:
  - `requestQerkoPairing`, `confirmQerkoPairing`
  - `getQerkoTerminals`, `getQerkoTerminalStatus`
  - `createQerkoTerminalPayment`, `getQerkoTerminalPaymentStatus`, `cancelQerkoTerminalPayment`
  - `createQerkoTerminalRefund`, `getQerkoTerminalRefundStatus`
- Ne-`started` výsledky z `create-*` jsou běžné obchodní stavy. Klient je vrací jako data v discriminated union a doménová vrstva je mapuje na chyby (`QerkoTerminalNotStarted { reason }`).
- Peníze: částky převádí `minorUnitsToDecimalString` a zpět `decimalAmountToMinorUnits` (`packages/core/src/modules/shared/money.ts`). Měny se zúží na `CZK|EUR|HUF|PLN|USD`.
- Test `qerko-client.test.ts` s falešným `fetch`, stejně jako `yadio-client.test.ts`.

### 2. Env
- `apps/web-app/src/core/app-env.ts`:
  - `VITE_PAYKY_QERKO_POS_ID` (výchozí `payky`). Sandbox přijme jakoukoli hodnotu.
  - Prostředí (produkce / sandbox) není env proměnná: volí se per účet při párování a ukládá se s klíčem v `qerkoPlugin.environment`.
- `apps/native-app`: obdobně `EXPO_PUBLIC_PAYKY_QERKO_POS_ID` v `nativeEnv`.
- `createQerkoApiDep` se přidá do `useAppRunDeps` v `apps/web-app/src/hooks/use-app-run.ts` a v `apps/native-app/src/hooks/use-app-run.ts`, do `createAppJobDeps` a do `AppBackgroundJobContext`.

### 3. Doména: modul `packages/core/src/modules/qerko-plugin/`
Moduly a soubory kopírují strukturu `fio-plugin`.
- **`qerkoPlugin`** je singleton s pevným id (`createIdFromString("payky-qerko-plugin")`, jako `fioPluginId`):
  - sloupce `environment` (`production` | `sandbox`; klíč patří k prostředí, ve kterém vznikl), `apiKey` (NonEmptyString, plain text v synced Evolu, stejně jako Fio token), `apiKeyName`, `legalEntityName`, `identificationNumber`, `country`
  - zápis přes `saveQerkoPlugin` / `deleteQerkoPlugin` (soft delete) a dotaz `qerkoPluginQuery`
- **Akce průvodce** (`qerko-plugin-actions.ts`):
  - `requestQerkoPairing({identificationNumber, country})` vrátí `pairingRequestId` a `resendAvailableInSeconds`
  - `confirmQerkoPairing({pairingRequestId, code, name})`:
    - při `ok` zavolá `/get-terminals` (kvůli názvu firmy) a uloží plugin
    - vrátí chyby `QerkoPairingInvalidCode {remainingAttempts}`, `QerkoPairingCodeExpired`, `QerkoPairingMaxAttemptsReached`
- **Registrace:** tabulky se přidají do `packages/core/src/evolu/schema.ts` a indexy přes `...qerkoPluginIndexes`.

### 4. Účet a platební metoda
- **Nový druh účtu `qerkoTerminal`:**
  - `AccountKindSchema` v `account-types.ts`, `DefaultPaymentMethodSchema` v `app-settings-types.ts`, `PaymentAccountKind` v `payment-types.ts`
  - tabulka `accountQerkoTerminal { id, currency }` v `account.ts`
  - id `createQerkoTerminalAccountId(currency)` → `account:qerkoTerminal:${currency}`
  - `saveQerkoTerminalAccount({enabled, currency})` podle `saveCardSwitchioAccount`
  - dotazy `qerkoTerminalAccountByIdQuery` a `qerkoTerminalAccountQuery`, join v `enabledPaymentMethodAccountsQuery`
- **Tabulka `paymentQerkoTerminal`** v `payment.ts`. Vzorem je `paymentCardSwitchio` a doc comment popíše životní cyklus.
  - `id: PaymentId`, `accountId`
  - `transactionId`: UUID posledního pokusu, uložené **před** `create-terminal-payment`
  - `pendingTransactionId`: pokus běží nebo je `unknown`
  - `unresolvedTransactionId`: výsledek `unknown` nebo `upstreamTimeout`; další pokus vyžaduje potvrzení, stejně jako `SwitchioAttemptUnresolved`
  - `terminalId`, `qerkoRefundId` (`receipt.refundId`, potřebný pro refund)
  - `authorizationCode`, `cardBrand`, `maskedPan`, `entryMode`, `sequenceNumber`, `merchantId`, `terminalDateTime`, `chargedTipAmount`
  - indexy `paymentQerkoTerminal_accountId` a `paymentQerkoTerminal_pendingTransactionId`
- **Výběr terminálu per zařízení:** device DB (`packages/core/src/evolu/device-client.ts`) dostane tabulku `qerkoTerminalSelection`.
  - Sloupce `id` odvozené z `DeviceAccountId`, `accountId`, `terminalId`, `terminalTid` a `locationName`.
  - Zápis je synchronní fire-and-forget funkce `selectQerkoTerminal(deviceEvolu, …)` v novém `packages/core/src/evolu/device-qerko.ts`, jako `device-cashu.ts`.
  - Čte se v Reactu přes `useDeviceEvoluQuery` a do Tasku se předává jako parametr `terminalId`.
- **Příprava platby** (`payment-preparation-actions.ts`):
  - `preparePaymentMethod` dostane `qerkoTerminal?: {accountId}`
  - `prepareQerkoTerminalMethod` zkontroluje měnu účtu
  - metoda nikdy nevyprší, takže `hasNonExpiringMethod` zahrne i ji
  - aliasy `qerkoAccountId` a `qerkoPendingTransactionId` / `qerkoUnresolvedTransactionId` přibudou do `paymentNonExpiringMethodsByIdQuery` a `paymentRequestQuery` (`payment-queries.ts`)

### 5. Platba: nový soubor `packages/core/src/modules/payment/payment-qerko-actions.ts`
`payment-actions.ts` je už velký. Chyby půjdou do `payment-errors.ts`.
- **`startQerkoTerminalPayment({paymentId, accountId, terminalId, deviceId, retryUnresolved})`:**
  1. Načte platbu, provede kontrolu měny (`loadAccountWithCurrencyCheck`) a `requirePayablePayment`. Pokud je nastavené `unresolvedTransactionId` a chybí `retryUnresolved`, vrátí chybu.
  2. Vygeneruje UUID (`crypto.randomUUID` přes závislost kvůli testům, nebo `createRowId`, podle toho, co projde regexem UUID; ověřit) a v jedné dávce upsertne `transactionId` a `pendingTransactionId`.
  3. Zavolá `create-terminal-payment` s `amount` = celkem včetně tipu, `tipAmount` = tip a `referenceId` = variabilní symbol z čísla platby.
  4. Při ne-`started` výsledku vymaže `pending` a vrátí `QerkoTerminalNotStarted { reason }`. U `upstreamTimeout` nechá `unresolvedTransactionId` nastavené.
  5. Při chybě sítě nechá `pending` nastavené. Další `sync` zavolá `get-status`; při `unknownTransaction` se pokus ukončí bez peněz.
- **`syncQerkoTerminalPayment({paymentId})`** udělá jeden poll `get-terminal-payment-status` pro `pendingTransactionId` a zapíše konečný výsledek:
  - `approved`: přes `markPaymentPaid` zapíše account transaction a claim. Bez status guardu, karta už byla stržena (payment/0004).
    - Generický `markPaymentPaid` dostane volitelný `amount` override, který se použije pro **`chargedAmount`**.
    - Druhou mutací doplní trace pole a vymaže `pending` i `unresolved`.
  - `failed`: vymaže `pending` a `unresolved` a vrátí `QerkoTerminalPaymentFailed { reason: declined|cancelled|reversed }`.
  - `unknown`: přesune pokus z `pending` do `unresolved` (payment/0006).
  - `pending`: vrátí `step` pro UI.
  - Mazání se vždy týká jen markeru *tohoto* pokusu (porovnává `transactionId`), stejně jako u Switchio.
- **`cancelQerkoTerminalPayment({paymentId})`** zavolá `/cancel-terminal-payment`. Výsledek se dozví až další `sync`.
- Mapy kind → hodnota s `satisfies Record` dostanou nový klíč, ostatní se doplní ručně:
  - `manualPaymentTransactionIdPrefixes`
  - `paymentMethodLabelKey` (`packages/app-shared/src/activity-labels.ts`)
  - `paymentMethodIcon` ve web i native verzi
  - `methodColors` ve web i native verzi
  - `onboardingPaymentMethodOrder` a aserce v e2e `onboarding.spec.ts`
  - `paymentMethodWeights` v demo datech

### 6. Refund na kartu
- `RefundMethodSchema` se rozšíří o `"qerkoTerminal"`.
- **`qerkoTerminalRefundAttempt`** je nová tabulka v modulu `refund`, protože refund vlastní její životní cyklus.
  - Sloupce:
    - `id` = předem zvolené `RefundId`
    - `paymentId`, `transactionId` (UUID), `terminalId`
    - `amount`, `isTip`, `linesJson` (přes `jsonCodec`)
    - `status: pending|failed|unknown`, `failureReason`
  - Řádek `refund` a záporná account transaction na účtu `qerkoTerminal` vzniknou **až po `approved`**. Dotazy nad refundy (sumy, statistiky, refundovatelný zbytek) se tak nemusí měnit.
- **`startQerkoTerminalRefund`:**
  1. Ověří zbytek k refundaci stejnou logikou jako `refundPayment`.
  2. Odmítne nový pokus, dokud na platbě nějaký běží.
  3. Uloží pokus.
  4. Zavolá `create-terminal-refund` s `refundId` z `paymentQerkoTerminal.qerkoRefundId`.
- **`syncQerkoTerminalRefund`** při `approved` zavolá `refundPayment` / `refundPaymentTip`, které nově přijímají volitelné `id`, a pokus soft-deletne, obojí v jedné dávce. Bude-li to potřeba, `refundPayment` se rozdělí na load/compute a upsert, podle vzoru `loadNextPaymentNumber` / `upsertPaymentNumberRows` z AGENTS.md.
- Refund metodou `qerkoTerminal` jde jen u platby zaplacené přes Qerko s uloženým `qerkoRefundId`. Jinak se nabízí jen `cashRegister` / `outside`.

### 7. Background job: `packages/core/src/background-jobs/jobs/qerko-terminal-sync-job.ts`
- Vzorem je `eet-reporting-job.ts`, tedy fronta řízená dotazem. Job se přihlásí k odběru čekajících plateb (`pendingTransactionId is not null`) a čekajících refund pokusů a volá `sync*` s backoffem: první poll po 1 s, potom se interval zdvojnásobuje až na 1 min. Při `connectivity.onOnline` hned zkusí znovu.
- Zajistí dokončení po restartu i na jiném zařízení. Zápisy jsou idempotentní díky deterministickým id v `markPaymentPaid`.
- Zaregistruje se v `browserBackgroundJobs` i `nativeBackgroundJobs`, protože CORS je povolený. Demo účet jobs nespouští.
- Factory `createQerkoTerminalSyncJob({ retryBaseDelayMs })` umožní testům zkrátit prodlevy.

### 8. Web UI (`apps/web-app/src/features/settings/payment-accounts/`)
- **`payment-accounts-settings-page.tsx`:** řádek `qerkoTerminal`, dostupný všude.
  - Bez spárování odkazuje na průvodce.
  - Po spárování ukazuje přepínač (`saveQerkoTerminalAccount`) a stav „terminál nevybrán na tomto zařízení“.
- **`qerko-terminal-settings-page.tsx`** (route `_terminal.settings.payment-accounts.qerko-terminal.tsx`, `access: "admin"`) má stavy:
  - **Nespárováno:** jednostránkový průvodce se `Stepper` z `components/reui/stepper.tsx`. Vzorem je `account-transfer-source-page.tsx` se `stepByPhase satisfies Record`. Kroky:
    1. IČO a země (země z `features/shared` country listu zúžená na CZ, SK, DE, AT, HU; výchozí CZ) a sbalitelná sekce „Další možnosti“ (`Collapsible`, vzor `fiat-bank-account-settings-page.tsx`) s výběrem prostředí Qerko API, výchozí produkce.
    2. Kód z e-mailu: 4 číslice, tlačítko „poslat znovu“ s odpočtem `resendAvailableInSeconds`, chyby `invalidCode` (zbývající pokusy), `codeExpired` a `maxAttemptsReached` (návrat na krok 1).
    3. Výběr terminálu: `getQerkoTerminals` přes `useQuery`, jen `enabled: true`, seskupené podle lokace. Volba se uloží přes `selectQerkoTerminal` do device DB.
  - **Spárováno:**
    - firma a název klíče; prostředí (jen ke čtení) ve sbalitelné sekci „Další možnosti“, změna znamená zrušit párování a spárovat znovu
    - terminál tohoto zařízení se změnou a tlačítkem „Otestovat spojení“ (`getQerkoTerminalStatus`)
    - zrušení párování, které smaže plugin a vypne účet, s confirm dialogem
- **Formuláře:** `useState`, `useSettingsForm`, `SettingsFormCard`, komponenty `Field*` a validační parsery v `packages/app-shared`.
- **Payment wait:**
  - nová záložka `"qerko"` v `PaymentMethodTab` / `PaymentMethodOption`
  - komponenta `payment-wait-qerko-tab.tsx`
- **Fáze karty na terminálu:**
  - **idle:** tlačítko „Zaplatit na terminálu“
  - **pending:** zobrazí lokalizovaný `step` a tlačítko „Zrušit“ (aktivní pro `connecting` / `waitingFor*`)
  - **unresolved:** potvrzení retry, stejné jako `retryUnresolved` u Switchio
  - **failed:** chybová hláška podle `reason`
- **Polling v UI:** `useQuery` s `refetchInterval: 1000`, dokud je `pendingTransactionId` nastavené a obrazovka otevřená. Volá `syncQerkoTerminalPayment`.
- **Bez vybraného terminálu** záložka odkazuje do nastavení.
- **Refund:** `RefundMethodField` v `features/activity/payment-refunds.tsx` dostane třetí volbu. Pending refund ukazuje stav a výsledek, polluje stejným způsobem.
- Seznam metod v `settings-page.tsx` a mapy `cardPaymentErrorKeys`-style přes `satisfies Record<Error["type"], TranslationKey>`.
- **Překlady:** `packages/app-shared/src/i18n/{en,cs,sk}/settings.ts` (`settings.qerkoTerminal.*`) a `payment.ts` (`paymentWait.qerko.*`, `paymentDetail.paymentMethod.qerkoTerminal`, `refund.method.qerkoTerminal`).

### 9. Native app (`apps/native-app`)
- Kit komponenty a stejné soubory jako na webu:
  - stránka nastavení a průvodce, route `app/settings/payment-accounts/qerko-terminal/index.tsx`
  - `route-access.ts`
  - qerko tab v `payment-wait-page.tsx`, včetně mapy `kindOf`
  - refund volba, method-breakdown, payment-method-display
- Nové soubory se zapíšou do `src/ui-parity/ui-parity-map.ts`.

### 10. Demo, e2e, docs
- **Demo:** `demo-data-generator.ts` dostane falešnou `QerkoApiDep`, která vždy vrátí `approved`, a zapne `saveQerkoTerminalAccount`. Případně stačí rozšířit podíl karty.
- **E2E (web):**
  - Fake Qerko server běží jako modul přes `window.__e2eQerkoApi` a `createE2eQerkoApiDep() ?? createQerkoApiDep(...)`, podle vzoru `apps/web-app/src/platform/e2e-spark-wallet.ts`.
  - Spec `apps/web-app/e2e/qerko-terminal.spec.ts` pokryje párování, platbu approved, declined, zrušení a refund. Před psaním přečíst `apps/web-app/e2e/AGENTS.md`.
- **E2E (native):** Maestro flow v `apps/native-app/e2e/`. Před psaním přečíst jeho `AGENTS.md`.
- **Decision records** v `docs/decisions/qerko/`, každý s `## Enforced by`:
  - 0001: API klíč se ukládá synchronizovaně v `qerkoPlugin`, terminál se vybírá per zařízení
  - 0002: platba zapisuje `chargedAmount`
  - 0003: `unknown` / `upstreamTimeout` jsou nejistý výsledek a vyžadují potvrzený retry (odkaz na payment/0006)
  - 0004: refund záznam vzniká až po `approved`; refund na kartu jen s `qerkoRefundId`
  - 0005: nedokončenou operaci dotáhne background job
- **Ostatní dokumentace:**
  - `docs/glossary.md`: heslo Qerko, druh účtu `qerkoTerminal` a upřesnění „Not a card terminal“
  - `docs/bill-payment-states.md`: nevyprší, refund přes terminál
  - nový `docs/qerko.md` s flow a mapováním stavů
  - `AGENTS.md`: integrace Qerko ve výčtu `integrations/`

## Pořadí implementace (samostatné commity)
1. `feat(qerko):` klient, env a testy klienta.
2. `feat(qerko-plugin):` tabulka, akce párování, device výběr terminálu a testy.
3. `feat(payment):` druh účtu `qerkoTerminal`, `paymentQerkoTerminal`, start/sync/cancel, override `chargedAmount` v `markPaymentPaid`, doplnění všech `Record` map, testy v `payment-qerko-actions.test.ts` (approved, chargedAmount > amount, failed, unknown → unresolved, retry, síťová chyba → unknownTransaction, zrušená platba mezitím).
4. `feat(background-jobs):` sync job a jeho test.
5. `feat(settings):` průvodce a nastavení na webu a překlady.
6. `feat(payment-wait):` qerko tab na webu.
7. `feat(refund):` refund přes terminál v core a na webu.
8. `feat(native):` parita native app.
9. `test(e2e):` web fake, spec a Maestro flow.
10. `docs:` decisions, glossary, qerko.md, AGENTS.md.

## Ověření
- `bun run check` (lint, tsc, decisions, vitest) po každém kroku.
- Ruční test proti **sandboxu**: `VITE_PAYKY_QERKO_BASE_URL=https://sandbox.qerko.com/api/v4/pos`, `bun run dev`, spárování s testovacím IČO, výběr terminálu, platba, zrušení a refund. Chování sandboxového terminálu ověřit na místě.
- Vypnutí prohlížeče uprostřed čekající platby: po startu ji background job dotáhne.
- `bun run test:e2e` (nový spec a onboarding order), `bun run test:e2e:native:web`, `bun run --cwd apps/native-app ui-parity <file>` pro nové obrazovky.

## Otevřené body k ověření během implementace
- Formát UUID: Qerko vyžaduje `^[0-9a-f]{8}-…$`. Evolu `createRowId` UUID není, takže použijeme `crypto.randomUUID()` za závislostí (`RandomDep` nebo podobnou, pokud v `deps.ts` existuje).
- Jestli sandbox posílá párovací kód skutečně na e-mail, nebo má testovací kód.
- `referenceId` ≤ 20 znaků: variabilní symbol se vejde.
