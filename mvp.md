# MVP zadání: Payky POS

## Účel aplikace

Payky je mobilně orientovaná PWA aplikace napodobující rozložení obrazovek POS terminálu NumoPay. Slouží k přijímání bitcoinových Lightning plateb přes Spark protokol a k evidenci prodejů v lokálním zařízení.

Aplikace musí být použitelná jako jednoduchý prodejní terminál:

- prodejce zadá částku nebo sestaví účet z položek,
- aplikace vytvoří reálnou Lightning fakturu přes Spark SDK,
- prodejce může z platební obrazovky odejít zpět do aplikace,
- aplikace dál hlídá stav platby na pozadí,
- po zaplacení nebo expiraci se stav projeví v aktivitě a detailu platby.

Primární distribuce MVP je PWA v prohlížeči.

## Inspirace a rozložení UI

Aplikace má používat stejné typy obrazovek jako NumoPay. Screenshoty jsou v `./screenshots`.
Aplikace má napodobit hlavně rozložení obrazovek a workflow, ne přesné vizuální detaily NumoPay. Má využívat shadcn komponenty.

Požadavky:

- UI musí působit jako mobilní aplikace.
- Na desktopu omez šířku aplikace na mobilní šířku.
- Nevytvářej kolem aplikace dodatečný shell nebo rámeček telefonu.
- Použij lehké, střídmé UI: ne příliš tučné fonty, ne těžké ikony.
- Touch targety musí zůstat pohodlné pro mobilní ovládání.
- Použij shadcn-style lokální UI komponenty v `src/components/ui`.
- Preferuj využívání existujících shadcn komponent před vytváření vlastních. Stáhni se je pomocí `bunx --bun shadcn@latest add <name>`. Nikdy si shadcn komponenty nevymýšlej.
- UI primitiva musí vycházet z Base UI.
- Uživatelsky viditelné texty nesmí být hardcodované v React komponentách.

## Hlavní obrazovky

MVP obsahuje tyto obrazovky:

- hlavní POS obrazovka pro ruční zadání částky,
- platební obrazovka s Lightning fakturou a QR kódem,
- aktivita se seznamem plateb,
- detail platby,
- nastavení,
- správa katalogových položek,
- editace katalogové položky,
- `/bill` obrazovka pro sestavení účtu z položek.

Rozložení odvoď ze screenshotů:

- `screenshots/activity.jpg`
- `screenshots/settings.jpg`
- `screenshots/settings_items.jpg`
- `screenshots/item_edit.jpg`
- `screenshots/bill.jpg`

## Platební workflow

MVP musí podporovat reálný Spark/Lightning platební tok.

Požadavky:

- Aplikace vytvoří reálnou Lightning fakturu přes `@buildonspark/spark-sdk`.
- Aplikace musí umět zobrazit český bankovní platební QR kód pro platbu převodem.
- Aplikace musí umožnit označit platbu jako zaplacenou hotově bez vytvoření nebo čekání na Lightning fakturu.
- Hotovostní platba se ukládá do stejné lokální evidence plateb a musí být jasně odlišená od Lightning platby.
- Platba se založí do lokální databáze hned při vytvoření faktury.
- Uživatel může z platební obrazovky odejít zpět do aplikace.
- Stav platby se hlídá na pozadí i mimo platební obrazovku.
- Po zaplacení se platba automaticky označí jako zaplacená.
- Po expiraci nezaplacené faktury se platba označí jako `expired` nebo `failed`.
- Expired i failed platby zůstávají viditelné v aktivitě.
- Detail platby musí zobrazit QR kód a Lightning fakturu, pokud je faktura stále dostupná.
- Platební obrazovka musí umět přepnout mezi BTC Lightning QR kódem, českým bankovním platebním QR kódem a potvrzením platby hotově.
- Bankovní QR platba se v MVP neověřuje automaticky přes banku; uživatel ji musí ručně potvrdit jako zaplacenou nebo ponechat ve stavu pending.

Payment watcher:

- Primárně používej event nebo stream ze Spark SDK.
- Polling používej jen jako fallback.
- Logika watcheru musí být oddělená od React UI.
- Watcher musí jít spustit i bez frontendu přes Bun script.

Demo režim:

- Pokud není dostupná Spark konfigurace, aplikace může běžet v demo režimu.
- Demo režim slouží pouze pro vývoj a testování POS workflow.
- Demo režim nesmí nahrazovat reálný platební tok MVP.

## Spark konfigurace

Spark integrace musí být izolovaná mimo React UI, například v `src/spark.ts`.

Při prvním spuštění aplikace automaticky vytvoří náhodný Spark mnemonic a uloží ho lokálně přes Evolu. Výchozí síť pro novou instalaci je `MAINNET`.

Spark mnemonic musí jít nastavit také v UI a uložit lokálně přes Evolu. Mnemonic neukládej do běžného `localStorage`.

Návrh ukládání mnemonicu musí výslovně řešit bezpečnostní rizika:

- data jsou uložena pouze lokálně v zařízení,
- uživatel musí vědět, že ztráta zařízení nebo profilu prohlížeče může znamenat ztrátu přístupu,
- běžný localStorage není povolen pro citlivá data,
- produkční verze by měla později doplnit silnější ochranu, například šifrování heslem nebo systémové úložiště.

## Bankovní platby

MVP podporuje český bankovní platební QR kód jako alternativní způsob úhrady.

Požadavky:

- V nastavení musí jít vyplnit IBAN příjemce pro bankovní platby.
- IBAN se ukládá lokálně přes Evolu jako součást nastavení aplikace.
- Bankovní QR kód se generuje z částky platby, fiat měny, IBANu a volitelné poznámky nebo identifikátoru platby.
- Bankovní QR kód musí být dostupný pouze v případě, že je v nastavení vyplněný IBAN.
- UI musí jasně zobrazit, že bankovní platba vyžaduje ruční potvrzení zaplacení.
- MVP neobsahuje napojení na bankovní API ani automatické párování příchozích plateb.

## Fiat měny a kurz

MVP podporuje pouze tyto fiat měny:

- USD
- CZK
- EUR

Přepočet fiat/BTC musí používat živý kurz z Yadio API.

Požadavky:

- Kurz se musí cachovat pro offline fallback.
- Při nedostupnosti API aplikace použije poslední známý kurz.
- UI musí jasně pracovat s vybranou fiat měnou.
- Výchozí měna může být určena z locale nebo nastavena na USD, pokud locale nejde spolehlivě vyhodnotit.

## Data a persistence

Persistentní aplikační data ukládej přes Evolu.

Použij vývojové verze Evolu se Zod schématy:

- `@evolu/common`: `8.0.0-next.5`
- `@evolu/react`: `11.0.0-next.0`
- `@evolu/react-web`: `3.0.0-next.0`
- `@evolu/sqlite-wasm`: `2.2.4`
- `@evolu/web`: `3.0.0-next.1`
- `@evolu/nodejs`: `3.0.0-next.3`

Aplikace používá Evolu local-only režim:

- používá Evolu (https://github.com/evoluhq/evolu) jako jedinou persistovací vstvu.
- data zůstávají na zařízení,
- relay synchronizace není součást MVP,
- přímé použití `localStorage` je povolené jen pro nekritické UI preference, například jazyk.

Používej Zod pro:

- Evolu schémata,
- doménové modely,
- formuláře,
- validaci importu a exportu.

Pro formuláře používej TanStack Form. Validaci formulářových hodnot napoj na Zod schémata.

Modelová a business část musí být napsaná tak, aby šla použít bez frontendu. Pro provozní operace bez frontendu připrav Bun scripts.
Web i CLI budou jen obálkou nad hotovou business vrstvou.

Výsledné CLI scripty:
- watch-payments
- add-item
- import-items
- export-items
- list-items
- list-payments

## Doménové entity

MVP musí minimálně evidovat:

- platby,
- položky účtu v platbě,
- katalogové položky,
- rozpracované účty,
- nastavení aplikace,
- Spark konfiguraci,
- cachované fiat/BTC kurzy.

Platba musí obsahovat minimálně:

- interní ID,
- částku ve fiat měně,
- fiat měnu,
- částku v BTC nebo sats,
- způsob platby, minimálně `lightning`, `bank_qr` nebo `cash`,
- Lightning fakturu, pokud jde o Lightning platbu,
- bankovní QR payload nebo technická data pro bankovní QR platbu, pokud jde o bankovní platbu,
- status,
- čas vytvoření,
- čas zaplacení, pokud existuje,
- čas expirace, pokud existuje,
- položky účtu,
- technická Spark data pro debug.

Status platby musí minimálně rozlišovat:

- draft nebo created,
- pending,
- paid,
- expired,
- failed.

Katalogová položka má v MVP povinné:

- název,
- cenu.

Volitelné:

- kategorie,
- varianta,
- obrázek.

## Účty a katalog

Na obrazovce `/bill` musí jít vytvořit účet pomocí vkládání katalogových položek.

Požadavky:

- přidání položky do účtu,
- změna množství položky,
- odebrání položky,
- výpočet celkové částky,
- vytvoření platby z účtu,
- uložení rozpracovaného účtu,
- obnovení rozpracovaného účtu.

V nastavení musí jít spravovat katalogové položky:

- vytvořit položku,
- upravit položku,
- smazat nebo deaktivovat položku,
- importovat katalog,
- exportovat katalog.

Editace katalogových položek:

- editace hodnot musí být inline přímo u konkrétního pole.
  - Využij stejné řešení jako zde: https://github.com/finitoapp/finito/blob/main/components/inline-edit/inline-edit.tsx
- změna pole se ukládá průběžně bez samostatného formulářového submitu celé položky,
- do Evolu ukládej pouze změnu konkrétní hodnoty, ne kompletní přepis celé položky, pokud to není nezbytné pro vytvoření nové položky nebo import.

## Aktivita a detail platby

Aktivita zobrazuje všechny založené platby včetně zaplacených, pending, expired a failed.

Aktivita a detail platby musí jasně zobrazit, jestli byla platba uhrazena přes Lightning, bankovním QR převodem nebo hotově.

Detail platby musí zobrazit:

- částku,
- fiat měnu,
- BTC nebo sats částku,
- způsob platby,
- status,
- Lightning fakturu a QR kód, pokud jde o Lightning platbu a faktura je dostupná,
- bankovní QR kód a IBAN, pokud jde o bankovní QR platbu,
- čas vytvoření,
- čas zaplacení,
- položky z účtu,
- technické Spark údaje pro debug.

## Import a export

MVP obsahuje pouze ruční import/export.

Požadavky:

- CSV export plateb,
- CSV export položek účtu v platbě,
- import katalogu,
- export katalogu.

Automatické zálohování ani automatické stahování po každé platbě není součást MVP.

## Multi-window lock

Aplikace musí hlídat, jestli neběží ve více oknech.

Pokud už běží aktivní okno:

- nové okno zobrazí blokující hlášku,
- uživatel může ručně převzít aktivitu v novém okně,
- po převzetí aktivity se původní okno zablokuje.

Cílem je zabránit vícenásobnému sync/watch běhu a duplicitnímu hlídání plateb.

## PWA a offline režim

Aplikace je Vite PWA.

Požadavky:

- aplikace se načte jako PWA,
- aplikace funguje offline,
- lokální data jsou dostupná offline,
- kurz používá offline fallback z poslední známé hodnoty,
- reálné vytvoření a potvrzení Lightning platby vyžaduje dostupnou síť a Spark backend.

## Internacionalizace

Použij i18next.

MVP podporuje:

- English,
- Czech.

Výchozí jazyk se volí podle jazyka prohlížeče. Fallback je English.

Pravidla pro překlady:

- Nikdy nehardcoduj uživatelsky viditelný text v React komponentách.
- Každý viditelný text přidej do `src/i18n/resources.ts` pro `en` i `cs`.
- Používej dot-separated, feature-scoped klíče, například `pay.request`, `settings.language`, `activity.empty`.
- Nepřejmenovávej existující překladové klíče bez aktualizace všech použití.
- České překlady drž ASCII-only, pokud se projekt vědomě nerozhodne změnit encoding policy.
- Preferuj stabilní sémantické klíče před klíči odvozenými z přesného textu.

## Technologický stack

Použij:

- Bun jako runtime, dependency manager a script runner,
- TypeScript,
- Vite 8,
- PWA,
- React,
- TanStack Router dle best practives,
- TanStack Form,
- shadcn-style lokální UI komponenty,
- Base UI primitives, 
- Zod,
- Evolu,
- i18next,
- Spark SDK `@buildonspark/spark-sdk`,
- Biome pro linting a formatting.

Vytvářej si `branded types` pro speciální typy (IBAN apod.). Použij stejný způsob deklarace branded typů dle: https://github.com/finitoapp/finito/blob/main/lib/shared/types.ts

Používej Bun pro všechny package a script operace.

V Bun konfiguraci musí zůstat:

- `exact = true`

## Repo a dokumentace

Vygeneruj nebo udržuj:

- `README.md`,
- `AGENTS.md`,
- `.env.example`.

README musí popsat:

- účel aplikace,
- základní Bun příkazy,
- Spark env proměnné,
- demo režim,
- podporované měny,
- lokální Evolu persistence,
- ruční import/export.

Lokální env soubory, například `.env.local`, nesmí být verzované.

V kódu, komentářích, commit messages a běžné projektové dokumentaci používej angličtinu. Tento soubor `mvp.md` zůstává českým zadáním.

## Vývojová pravidla

Po změnách spouštěj:

- `bun run lint`
- `bun run build`

Dev server spouštěj jen při potřebě ručního ověření a po dokončení ho vypni.

Zachovej strict TypeScript nastavení.

## Mimo rozsah MVP

Do MVP nepatří:

- Evolu relay synchronizace mezi zařízeními,
- automatické zálohování,
- automatické stahování exportu po každé platbě,
- produkční hardening bezpečného úložiště mnemonicu nad rámec lokálního Evolu uložení a jasně popsaných rizik,
- podpora dalších fiat měn mimo USD, CZK a EUR.
