Níže je návrh zadání v markdownu. Nejasnosti jsem vyřešil jako explicitní **assumptions / open questions**, hlavně rozpor mezi „jedno zařízení / lokálně“ a „synchronizovat ostatní data“.

---

# Zadání aplikace: Local-first merchant POS inspirovaný NumoPay

## 1. Cíl aplikace

Cílem je vytvořit open-source PWA aplikaci pro drobné obchodníky, která bude fungovat jako jednoduchý merchant POS. Aplikace je inspirovaná UX aplikace NumoPay, ale místo tap-to-pay / NFC bude používat QR-based platební flow.

Aplikace má podporovat tři platební metody:

1. BTC přes Spark protokol
2. Hotovost
3. Český bankovní QR kód dle SPD standardu

Aplikace je určena pro jednoho obchodníka a primárně jedno zařízení. Architektura a datový model ale mají být navržené tak, aby byly kompatibilní s Evolu local-first přístupem a případným budoucím syncem mezi zařízeními.

Spark je Bitcoin layer 2 protokol a pro integraci se má použít balíček `@buildonspark/spark-sdk`. ([GitHub][1])
Evolu je TypeScript local-first platforma, která ukládá data lokálně na zařízení uživatele. ([GitHub][2])
Bankovní QR platby mají používat český formát QR Platba / SPD, který mimo jiné podporuje pole jako účet příjemce, částku, měnu a platební symboly. ([qr-platba.cz][3])
Pro kurz BTC/fiat se má použít Yadio API, které poskytuje real-time exchange rates přes REST API. ([yadio.io][4])

---

## 2. Typ aplikace

* PWA
* Merchant-only POS
* Bez zákaznické části
* Open-source
* Primárně pro mobil a POS-like zařízení
* Musí fungovat:

    * jako nainstalovaná PWA
    * i v běžném browser tabu

---

## 3. Podporované platformy

Primární cílení:

* mobilní browser
* instalovaná PWA
* dotykové POS zařízení s browserem

Desktop může fungovat responzivně, ale není hlavním cílem MVP.

---

## 4. Hlavní obrazovky

Aplikace bude obsahovat tyto hlavní screeny:

1. **Main**

    * POS kalkulačka
    * vytvoření platby
    * výběr platební metody
    * přidání tipu

2. **Checkouts**

    * správa otevřených účtů
    * vytvoření nového účtu
    * uložení účtu
    * správa položek na účtu
    * částečné platby
    * rozdělení účtu

3. **Activity**

    * historie plateb
    * filtrování
    * detail platby
    * export do CSV

4. **Settings**

    * nastavení platebních metod
    * IBAN
    * nastavení platební řady pro výpočet VS
    * měna
    * položky k prodeji
    * tips
    * stoly
    * Evolu seed info/export. Odvozený spark seed read-only 
    * jazyk
    * theme
    * about

---

# 5. Main screen: POS kalkulačka

## 5.1 Účel

Main screen slouží pro rychlé zadání finální částky a vytvoření platby. Má fungovat podobně jako jednoduchá POS kalkulačka.

## 5.2 Funkce

Main screen musí umožnit:

* zadat finální částku ve fiat měně
* zobrazit přepočet na BTC
* vybrat platební metodu
* přidat tip
* potvrdit / vytvořit platbu
* rychle přepnout stůl / checkout, pokud je platba spojena s otevřeným účtem

## 5.3 Platební metody na main screenu

Platební metody se zobrazí podle pořadí nastaveného v settings.

Metody budou přepínatelné pomocí tabů:

* Cash
* BTC / Spark
* Bankovní QR platba

Na této obrazovce musí být možné přidat tip před vytvořením platby.

## 5.4 Omezení

* Není potřeba podporovat DPH.
* Není potřeba podporovat slevy.
* Není potřeba podporovat množství položek přímo na kalkulačce.
* Platba nemůže být kombinovaná více metodami.
* Jedna platba = jedna platební metoda.

---

# 6. Checkouts screen: účty

## 6.1 Účel

Checkouts screen slouží ke správě otevřených účtů. Účet může reprezentovat například nákup u stolu, rozpracovanou objednávku nebo uloženou platbu.

## 6.2 Funkce

Aplikace musí umožnit:

* vytvořit nový checkout
* uložit checkout
* upravovat checkout
* přidávat položky z katalogu
* přidávat ručně zadané částky
* odstranit položku z checkoutu
* přiřadit checkout ke stolu
* ponechat checkout bez stolu
* přesunout checkout mezi stoly
* mít více otevřených checkoutů najednou
* mít více checkoutů na jednom stolu
* rozdělit checkout
* částečně zaplatit checkout
* stornovat checkout

## 6.3 Položky na checkoutu

Checkout může obsahovat:

1. Položky z katalogu
2. Ručně zadané částky

Každá položka na checkoutu musí mít minimálně:

* název
* částku ve fiat
* typ položky:

    * katalogová položka
    * ručně zadaná položka
    * tip

## 6.4 Částečné platby

Checkout může být zaplacen více platbami, ale každá jednotlivá platba používá právě jednu platební metodu.

Příklad:

* účet celkem: 1000 CZK
* platba 1: 400 CZK cash
* platba 2: 600 CZK BTC

Toto je povolené, protože nejde o jednu kombinovanou platbu, ale o více samostatných plateb.

---

# 7. Activity screen: historie plateb

## 7.1 Účel

Activity screen zobrazuje historii plateb.

## 7.2 Funkce

Musí umožnit:

* zobrazit seznam plateb
* filtrovat platby podle:

    * data
    * platební metody
    * stavu
    * stolu
* otevřít detail platby
* exportovat historii plateb do CSV

## 7.3 Detail platby

Detail platby musí obsahovat:

* interní ID platby
* datum vytvoření
* datum zaplacení, pokud existuje
* částku ve fiat
* fiat měnu
* částku v BTC, pokud jde o BTC platbu
* použitý kurz, pokud jde o BTC platbu
* platební metodu
* stav
* checkout ID, pokud platba patří k checkoutu
* table ID / table name, pokud existuje
* tip, pokud byl přidán
* technická data podle metody:

    * Spark invoice / payment request
    * bankovní QR payload
    * variabilní symbol
    * cash confirmation metadata

## 7.4 Export CSV

CSV export musí obsahovat minimálně:

* payment ID
* created at
* paid at
* status
* method
* fiat amount
* fiat currency
* tip amount
* checkout ID
* table name
* variable symbol
* BTC amount
* exchange rate
* technical reference

---

# 8. Settings screen

## 8.1 Pořadí platebních metod

Uživatel může nastavit pořadí platebních metod:

* cash
* BTC / Spark
* bankovní QR platba

Toto pořadí ovlivňuje pořadí tabů na platební obrazovce.

## 8.2 Fiat currency

Podporované měny:

* CZK jako default
* EUR
* USD

Poznámka: bankovní QR platba je dostupná pouze pro CZK.

## 8.3 Správa položek k prodeji

Položka obsahuje:

```ts
type Item = {
  id: string;
  name: string;
  description: string | null;
  fiatPrice: number;
};
```

Pravidla:

* cena položky je vždy v aktuálně nastavené fiat měně
* není potřeba podporovat kategorii
* není potřeba podporovat obrázky
* není potřeba podporovat sklad
* není potřeba podporovat daňové sazby
* mazání se řeší přes Evolu soft delete

## 8.4 Tips

Tips lze zapnout nebo vypnout.

Nastavení tips obsahuje:

* enabled / disabled
* předvolené procentní hodnoty
* předvolené fixní hodnoty
* možnost zadat vlastní tip

Tips jsou dostupné pro všechny platební metody.

Tip je součástí checkoutu / platby, nikoliv samostatná nezávislá platba.

## 8.5 Správa stolů

Stůl obsahuje pouze:

```ts
type Table = {
  id: string;
  name: string;
};
```

Pravidla:

* jeden stůl může mít více otevřených checkoutů
* checkout může být bez stolu
* checkout lze přesunout mezi stoly

## 8.6 Bankovní platby

Nastavení bankovních plateb obsahuje:

* IBAN obchodníka
* nastavení číselné řady pro variabilní symbol
* poslední použité číslo

Bankovní platby jsou podporované pouze pro CZK.

## 8.7 Spark

Spark seed se neukládá samostatně. Musí být deterministicky odvozen z Evolu mnemonic.

Settings musí umožnit:

* zobrazit bezpečnostní informaci o seedu
* exportovat mnemonic / seed s potvrzením
* vygenerovat nový náhodný mnemonic pouze při inicializaci aplikace nebo explicitním resetu onboarding flow

Aplikace nemá vyžadovat PIN ani heslo při otevření.

Export seedu musí vyžadovat potvrzení a zobrazit bezpečnostní varování.

## 8.8 Jazyk

Jazyky:

* CZ
* EN

Default:

* podle browseru
* fallback na EN

Jazyk je jedna z mála hodnot, které lze uložit mimo Evolu.

## 8.9 Theme

Podporované hodnoty:

* light
* dark
* system

Theme je jedna z mála hodnot, které lze uložit mimo Evolu.

## 8.10 About

About screen obsahuje:

* verzi aplikace
* link na GitHub repozitář

---

# 9. Platební metody

## 9.1 Společný platební model

Každá platba má jeden z těchto stavů:

```ts
type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";
```

Každá platba má právě jednu metodu:

```ts
type PaymentMethod =
  | "cash"
  | "spark"
  | "bank";
```

Refundy nejsou součástí MVP.

Kombinovaná platba více metodami není podporovaná. Částečné zaplacení checkoutu se řeší vytvořením více samostatných plateb.

---

## 9.2 Cash platba

Cash platba funguje jednoduše:

1. Obsluha zvolí cash.
2. Aplikace zobrazí částku.
3. Obsluha ručně klikne na tlačítko „Zaplaceno“.
4. Platba se přepne do stavu `paid`.

Cash platba neřeší:

* kolik zákazník předal hotovosti
* kolik se má vrátit
* evidenci pokladníka

---

## 9.3 BTC platba přes Spark

BTC platba slouží pouze pro přijímání plateb.

Flow:

1. Obsluha zadá fiat částku.
2. Aplikace získá kurz BTC/fiat přes Yadio API.
3. Aplikace vypočítá BTC částku.
4. Aplikace vytvoří novou LN invoice / payment request přes Spark SDK.
5. Aplikace zobrazí QR kód.
6. Aplikace čeká na potvrzení platby.
7. Po potvrzení se platba přepne do `paid`.
8. Pokud platba selže, přepne se do `failed`.
9. Pokud platba vyprší, přepne se do `expired`.
10. Obsluha může platbu ručně zrušit, pak se přepne do `canceled`.

Pravidla:

* každá BTC platba musí mít novou invoice
* Spark platba vyžaduje internet
* offline nelze založit ani potvrdit Spark platbu
* aplikace nepodporuje odesílání BTC
* aplikace nepodporuje refundy

Seed:

* Spark seed se deterministicky odvozuje z Evolu mnemonic
* Spark seed se samostatně neukládá
* export seedu / mnemonic musí mít bezpečnostní varování

---

## 9.4 Bankovní QR platba

Bankovní platba používá český QR platební kód dle SPD standardu.

Flow:

1. Obsluha zvolí bankovní platbu.
2. Aplikace vygeneruje variabilní symbol.
3. Aplikace vytvoří SPD payload.
4. Aplikace zobrazí QR kód.
5. Zákazník zaplatí ve své bankovní aplikaci.
6. Aplikace sama neověřuje přijetí platby.
7. Obsluha ručně potvrdí zaplacení.
8. Platba se přepne do `paid`.

Podporovaná pole:

* IBAN
* částka
* měna
* variabilní symbol

Omezení:

* pouze CZK
* žádná integrace s bankovním API
* potvrzení platby je ruční

---

# 10. Variabilní symbol a číselná řada

Pro bankovní platby musí aplikace generovat variabilní symbol na základě dat uložených v Evolu databázi.

## 10.1 Schema

```ts
paymentNumberSeries: {
  id: TableIdSchema;
  serialNumberDigits: PositiveIntegerSchema;
  yearFormat: z.enum(["default", "short"]);
  monthFormat: z.enum(["default", "hidden"]);
  dayFormat: z.enum(["default", "hidden"]);
  prefix: NonEmptyString32Schema.nullable();
};

paymentLastNumber: {
  id: TableIdSchema;
  serialNumber: NonNegativeIntegerSchema;
  // Anchor date used for reset logic depending on configured formats.
  date: DateStringSchema.nullable();
};
```

## 10.2 Pravidla generování

Variabilní symbol se skládá z konfigurovatelných částí:

* volitelný prefix
* rok
* měsíc
* den
* sériové číslo s doplněním nul podle `serialNumberDigits`

Formát data se řídí konfigurací:

```ts
yearFormat: "default" | "short";
monthFormat: "default" | "hidden";
dayFormat: "default" | "hidden";
```

Příklad možného výstupu:

```txt
202605230001
2605230001
2026050001
260001
```

Přesný formát musí být deterministický a otestovaný unit testy.

## 10.3 Reset sériového čísla

`paymentLastNumber.date` slouží jako anchor date pro reset logiku.

Reset sériového čísla závisí na zvolených formátech:

* pokud je ve formátu zahrnutý den, číselná řada se resetuje denně
* pokud je zahrnutý měsíc, ale ne den, resetuje se měsíčně
* pokud je zahrnutý rok, ale ne měsíc ani den, resetuje se ročně
* pokud není žádná datumová granularita použitá, řada se neresetuje automaticky

## 10.4 Atomicita

Při vytvoření bankovní platby musí dojít atomicky k:

1. načtení aktuálního `paymentLastNumber`
2. výpočtu dalšího čísla
3. uložení nové platby
4. aktualizaci `paymentLastNumber`

V rámci jednoho zařízení stačí využít transakční možnosti lokální databáze / Evolu patternů.

---

# 11. Data storage

## 11.1 Evolu

Všechna doménová data se ukládají do Evolu.

Do Evolu patří:

* položky k prodeji
* stoly
* checkouty
* checkout položky
* platby
* payment number series
* payment last number
* settings kromě theme a language
* Spark/Evolu mnemonic, pokud je Evolu takto používá
* stav otevřených účtů
* historie plateb

## 11.2 Výjimky mimo Evolu

Nepoužívat `localStorage`, kromě:

* language
* theme

Tyto dvě hodnoty mohou být uložené mimo Evolu, protože musí být dostupné velmi brzy při startu aplikace.

## 11.3 Local-first režim

MVP cíl:

* aplikace funguje lokálně na jednom zařízení
* cash, checkouts, katalog, stoly, historie a QR bankovní platby fungují offline
* Spark platby vyžadují internet

Budoucí kompatibilita:

* datový model má být navržen tak, aby byl kompatibilní s Evolu syncem
* konflikty se v budoucím multi-device režimu budou řešit podle Evolu CRDT pravidel
* business logika by neměla předpokládat existenci centrálního serveru

---

# 12. Offline chování

Aplikace musí offline umožnit:

* otevřít aplikaci
* pracovat s katalogem položek
* spravovat stoly
* vytvářet a upravovat checkouty
* zadávat cash platby
* ručně potvrzovat cash platby
* generovat bankovní QR platby
* ručně potvrzovat bankovní platby
* zobrazit historii plateb
* exportovat CSV

Offline aplikace nemusí umožnit:

* získat kurz z Yadio API
* vytvořit Spark invoice
* potvrdit Spark platbu

Pokud je uživatel offline a zvolí Spark platbu, aplikace musí jasně zobrazit, že BTC platba vyžaduje internet.

---

# 13. Technický stack

## 13.1 Frontend

Předpokládaný stack:

* React
* Vite
* TypeScript
* PWA
* TanStack Form
* Zod
* Evolu
* Spark SDK

Doporučené, ale nutné potvrdit:

* TanStack Router
* Tailwind / shadcn/ui nebo jiný komponentový systém

## 13.2 Formuláře

Formuláře se implementují pomocí:

```txt
@tanstack/react-form
```

Validace formulářů se řeší přes Zod.

## 13.3 Schema

Zod je single source of truth pro:

* validace formulářů
* doménové typy
* Evolu schema
* import/export
* business input/output validace
* adaptéry

---

# 14. Architektura

## 14.1 Oddělení business vrstvy

Business vrstva musí fungovat samostatně bez závislosti na browseru, Reactu, DOM API nebo PWA API.

Business vrstva nesmí přímo používat:

* `window`
* `document`
* `localStorage`
* browser-only API
* React hooks
* UI komponenty

Business vrstva smí používat čisté TypeScript typy, Zod schemas a dependency injection.

Příklad požadovaného stylu:

```ts
export const createItem =
  (deps: EvoluDep) =>
  (item: ItemInput): Promise<ItemId> => {
    return deps.evolu.insert("item", item);
  };
```

## 14.2 Dependency injection

Integrace s externím světem musí být přes porty/adaptéry.

Příklady portů:

```ts
type EvoluDep = {
  evolu: EvoluClient;
};

type ClockDep = {
  now: () => Date;
};

type ExchangeRateDep = {
  getBtcFiatRate: (currency: FiatCurrency) => Promise<ExchangeRate>;
};

type SparkWalletDep = {
  createInvoice: (input: CreateSparkInvoiceInput) => Promise<CreateSparkInvoiceResult>;
  waitForPayment: (invoiceId: string) => Promise<SparkPaymentResult>;
};

type QrCodeDep = {
  createQrCodePayload: (input: QrCodeInput) => string;
};
```

## 14.3 Spark jako adaptér

Spark SDK nesmí být natvrdo rozlezlé po celé aplikaci.

Musí existovat Spark adaptér, který implementuje business port:

```ts
type SparkPaymentAdapter = {
  createReceivePayment: (input: {
    amountSats: number;
    memo?: string;
    expiresAt?: Date;
  }) => Promise<{
    invoice: string;
    expiresAt: Date;
    technicalData: unknown;
  }>;

  observePayment: (input: {
    invoice: string;
  }) => Promise<{
    status: "paid" | "failed" | "expired";
    technicalData: unknown;
  }>;
};
```

## 14.4 Kurz jako adaptér

Yadio API musí být schované za adaptérem:

```ts
type ExchangeRateAdapter = {
  getBtcRate: (currency: "CZK" | "EUR" | "USD") => Promise<{
    rate: number;
    source: "yadio";
    fetchedAt: Date;
  }>;
};
```

Business logika nesmí být závislá přímo na konkrétním HTTP endpointu.

---

# 15. Navržený doménový model

## 15.1 Fiat currency

```ts
type FiatCurrency = "CZK" | "EUR" | "USD";
```

## 15.2 Payment method

```ts
type PaymentMethod = "cash" | "spark" | "bank";
```

## 15.3 Payment status

```ts
type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";
```

## 15.4 Item

```ts
type Item = {
  id: string;
  name: string;
  description: string | null;
  fiatPrice: number;
};
```

## 15.5 Table

```ts
type Table = {
  id: string;
  name: string;
};
```

## 15.6 Checkout

```ts
type Checkout = {
  id: string;
  tableId: string | null;
  status: "open" | "partially_paid" | "paid" | "canceled";
  createdAt: string;
  updatedAt: string;
};
```

## 15.7 Checkout item

```ts
type CheckoutItem = {
  id: string;
  checkoutId: string;
  type: "catalog_item" | "manual_amount" | "tip";
  itemId: string | null;
  name: string;
  description: string | null;
  fiatAmount: number;
  createdAt: string;
};
```

## 15.8 Payment

```ts
type Payment = {
  id: string;
  checkoutId: string | null;
  tableId: string | null;

  method: PaymentMethod;
  status: PaymentStatus;

  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  tipAmount: number;

  btcAmountSats: number | null;
  exchangeRate: number | null;
  exchangeRateSource: "yadio" | null;
  exchangeRateFetchedAt: string | null;

  variableSymbol: string | null;
  bankQrPayload: string | null;

  sparkInvoice: string | null;
  sparkTechnicalData: unknown | null;

  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  canceledAt: string | null;
};
```

## 15.9 Settings

```ts
type AppSettings = {
  fiatCurrency: FiatCurrency;
  paymentMethodOrder: PaymentMethod[];
  tipsEnabled: boolean;
  presetTipPercentages: number[];
  presetTipFixedAmounts: number[];
  bankIban: string | null;
};
```

---

# 16. Business use-cases

## 16.1 Items

Business vrstva musí obsahovat use-cases:

* create item
* update item
* delete item přes Evolu soft delete
* list active items

## 16.2 Tables

* create table
* update table
* delete table přes Evolu soft delete
* list active tables

## 16.3 Checkouts

* create checkout
* assign checkout to table
* move checkout to another table
* remove table from checkout
* add catalog item to checkout
* add manual amount to checkout
* add tip to checkout
* remove checkout item
* split checkout
* partially pay checkout
* cancel checkout
* close checkout as paid

## 16.4 Payments

* create payment
* show payment details (QR code) based on default payment method
* possibility to switch payment method
* mark payment as paid | mark as failed/canceled
* mark payment as expired

## 16.5 Export

* export payment history to CSV

---

# 17. Testování

## 17.1 Unit testy

Business vrstva musí mít unit testy nezávislé na browseru.

Testovat minimálně:

* vytvoření položky
* úprava položky
* soft delete položky
* vytvoření checkoutu
* přidání položky do checkoutu
* přidání ruční částky
* přidání tipu
* částečná platba
* rozdělení checkoutu
* storno checkoutu
* cash payment flow
* bank payment flow
* Spark payment flow přes mock adaptér
* výpočet BTC částky z fiat částky a kurzu
* generování variabilního symbolu
* reset číselné řady podle data
* CSV export

## 17.2 Adapter testy

Adaptéry se testují odděleně:

* Yadio adapter
* Spark adapter
* SPD QR payload generator
* Evolu repository adapter

## 17.3 UI testy

UI testy jsou volitelné pro MVP, ale doporučené pro:

* main calculator flow
* vytvoření checkoutu
* zaplacení cash platby
* vytvoření bankovní QR platby
* vytvoření Spark platby s mockem

---

# 18. Security požadavky

## 18.1 Seed

* Spark seed se neukládá přímo.
* Spark seed se deterministicky odvozuje z Evolu mnemonic.
* Export mnemonic/seed musí vyžadovat potvrzení.
* Před exportem musí být zobrazeno bezpečnostní varování.

## 18.2 PIN / heslo

Aplikace v MVP nevyžaduje PIN ani heslo při otevření.

## 18.3 Reset dat

MVP nemusí obsahovat reset wallet / wipe data.

## 18.4 Sensitive data

Evolu storage lze považovat za bezpečnou a šifrovanou databázi. Lze do ní ukládat citlivé informace včetně debugging a audit dat.

---

# 19. PWA požadavky

Aplikace musí:

* mít web app manifest
* být instalovatelná
* mít service worker
* fungovat offline pro podporované offline funkce
* cachovat aplikační shell
* mít offline fallback
* být optimalizovaná pro mobilní portrait layout
* mít velká dotyková tlačítka vhodná pro POS použití

---

# 20. Restrikce

## 20.1 Nepoužívat localStorage

`localStorage` se nesmí používat pro doménová data.

Výjimky:

* jazyk
* theme

## 20.2 Žádný backend jako zdroj pravdy

Aplikace nemá mít klasický backend jako centrální zdroj pravdy.

Externí služby mohou být použité pouze jako adaptéry:

* Yadio API pro kurzy
* Spark síť / SDK pro BTC platby

## 20.3 Business logika bez browseru

Business vrstva musí být spustitelná a testovatelná v Node.js bez browser prostředí.

---

# 21. MVP rozsah

## 21.1 Součást MVP

MVP obsahuje:

* PWA shell
* main POS kalkulačku
* cash platby
* bankovní QR platby
* Spark receive platby
* checkouts
* položky k prodeji
* stoly
* tips
* activity/history
* CSV export
* settings
* CZ/EN
* dark/light/system theme
* Evolu local-first storage
* Zod schemas
* TanStack Form formuláře
* business vrstvu s DI
* unit testy business vrstvy
* kombinovaná platba v rámci jedné payment (lze za v rámci platby volit typ platby)

## 21.2 Mimo MVP

Mimo MVP jsou:

* refundy
* odesílání BTC
* bankovní API pro potvrzení platby
* PIN / heslo při otevření
* více uživatelů
* role a oprávnění
* DPH
* sklad
* obrázky položek
* kategorie položek
* účtenky
* tisk
* integrace účetnictví
* tap-to-pay / NFC

---

# 22. Otevřené body k doplnění

Tyto body je potřeba ještě rozhodnout před implementací:

1. **Sync režim Evolu**
   V zadání je rozpor: aplikace je pro jedno zařízení a lokální použití, ale zároveň je požadavek „ostatní synchronizovat“. Pro MVP navrhuji:

    * implementovat lokálně
    * datový model připravit na sync
    * sync nezapínat jako povinnou funkci MVP

2. **Přesný formát variabilního symbolu**
   Je potřeba potvrdit:

    * zda prefix může obsahovat jen číslice
    * maximální délku VS
    * co dělat, pokud složený VS přesáhne limit bankovního pole

3. **Spark invoice expirace**
   Je potřeba určit default expiration time, například:

    * 5 minut
    * 10 minut
    * 15 minut

4. **Exchange rate fallback**
   Je potřeba určit, co dělat, když Yadio API neodpovídá:

    * zakázat Spark platbu
    * použít poslední známý kurz
    * umožnit ruční kurz

5. **CSV formát**
   Je potřeba určit:

    * oddělovač `,` nebo `;`
    * formát desetinných čísel
    * timezone pro datumy

6. **UI knihovna**
   Je potřeba potvrdit, zda použít:

    * shadcn/ui
    * vlastní komponenty
    * jiný design systém

---

# 23. Doporučená struktura projektu

```txt
src/
  app/
    routes/
    components/
    screens/
      MainScreen/
      CheckoutsScreen/
      ActivityScreen/
      SettingsScreen/

  domain/
    schemas/
    types/
    use-cases/
      items/
      tables/
      checkouts/
      payments/
      settings/
      export/
    services/
      payment-number-series/
      exchange-rate/
      qr-payment/
      tips/

  infrastructure/
    evolu/
    spark/
    yadio/
    qr-code/
    pwa/

  ui/
    components/
    forms/
    layout/
    theme/
    i18n/

  tests/
    domain/
    adapters/
```

---

# 24. Definice hotovo

Aplikace je považovaná za hotovou v MVP, pokud:

* jde nainstalovat jako PWA
* funguje na mobilu
* jde vytvořit cash platba
* jde vytvořit bankovní QR platba
* jde vytvořit Spark BTC platba při online stavu
* jde spravovat otevřené checkouty
* jde přidat položky a ruční částky do checkoutu
* jde částečně zaplatit checkout
* jde spravovat položky k prodeji
* jde spravovat stoly
* jde nastavit tips
* jde nastavit IBAN
* jde zobrazit historii plateb
* jde exportovat historii do CSV
* business vrstva má unit testy
* doménová data nejsou ukládána do `localStorage`
* business vrstva nemá závislost na browseru
* Spark integrace je za adaptérem
* Yadio integrace je za adaptérem
* Zod schema je použité jako single source of truth pro validaci a datové typy

[1]: https://github.com/buildonspark/spark?utm_source=chatgpt.com "buildonspark/spark: The Spark Bitcoin layer 2 protocol"
[2]: https://github.com/evoluhq/evolu?utm_source=chatgpt.com "evoluhq/evolu: TypeScript library and local-first platform"
[3]: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/?utm_source=chatgpt.com "Specifikace formátu"
[4]: https://yadio.io/api.html?utm_source=chatgpt.com "Yadio.io API Documentation"
