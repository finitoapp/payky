import type { enSettings } from "@/i18n/en/settings.ts"

export const csSettings = {
  "settings.about.app.title": "Payky",
  "settings.about.description": "Verze, podmínky a kontakt",
  "settings.about.github.description": "Zapojte se do vývoje aplikace",
  "settings.about.github.title": "Zdrojový kód na GitHubu",
  "settings.about.privacy.body":
    "PAYKY - ZÁSADY OCHRANY SOUKROMÍ\n\n1. SBĚR DAT\nPayky neprodává osobní údaje a je navrženo tak, aby aplikační data zůstávala lokálně ve vašem zařízení. Aplikace ukládá nastavení terminálu, katalogová data, záznamy plateb a související provozní data lokálně a synchronizuje aplikační data přes Evolu.\n\n2. PLATEBNÍ DATA\nPlatební a terminálová data mohou obsahovat částky, časové údaje, názvy položek, stav platby, informace o mintech, identifikátory zařízení a další záznamy potřebné pro provoz bitcoinového platebního terminálu. Chraňte své zařízení, přihlašovací údaje, zálohy a přístupová data k mintům nebo peněženkám.\n\n3. SÍŤOVÁ KOMUNIKACE\nAplikace může komunikovat s:\n- infrastrukturou Evolu pro synchronizaci lokálních-first aplikačních dat\n- Cashu minty pro vydávání, proplácení nebo správu ecash tokenů\n- Lightning nebo peněženkovými službami používanými k vytvoření nebo vypořádání plateb\n- cenovými nebo kurzovými API, pokud je zapnutý fiat přepočet\n\nTyto služby mohou mít vlastní zásady ochrany soukromí, logy a pravidla uchovávání dat.\n\n4. ANALYTIKA A HLÁŠENÍ CHYB\nPayky nepoužívá analytické ani sledovací služby. K dispozici je volitelné hlášení chyb přes Sentry, které pomáhá diagnostikovat pády a chyby aplikace. Je ve výchozím stavu vypnuté a aktivuje se jen tehdy, když ho zapnete v Nastavení > Soukromí. Po zapnutí mohou hlášení chyb obsahovat informace o zařízení a aplikaci a chybové zprávy a stack trace; obnovovací fráze a čísla bankovních účtů jsou před odesláním automaticky redigovány.\n\n5. MINTY TŘETÍCH STRAN\nPři používání ecash mintů může provozovatel mintu vidět částky transakcí, časování, aktivitu proplácení tokenů a související metadata. Vybírejte důvěryhodné minty a nedržte zbytečné zůstatky u jednoho mintu.\n\n6. ZÁLOHY A SYNCHRONIZACE\nPokud jsou zapnuté synchronizační nebo zálohovací funkce, mohou být aplikační data přenášena do synchronizační infrastruktury. Se synchronizovanými daty zacházejte jako s provozními obchodními daty a chraňte každé zařízení, které k nim má přístup.\n\n7. KONTAKT\nKontaktní údaje pro otázky soukromí budou zveřejněny v dokumentaci projektu.\n\nPoslední aktualizace: červen 2026",
  "settings.about.privacy.description":
    "Data aplikace se ukládají lokálně a synchronizují přes Evolu.",
  "settings.about.privacy.heading": "Zásady ochrany soukromí Payky",
  "settings.about.privacy.summary":
    "Přizpůsobeno pro lokální-first bitcoinový platební terminál.",
  "settings.about.privacy.title": "Data a soukromí",
  "settings.about.terms.body":
    'PAYKY - PODMÍNKY POUŽÍVÁNÍ\n\n1. PŘIJETÍ\nPoužíváním této aplikace platebního terminálu souhlasíte s těmito podmínkami.\n\n2. POVAHA SLUŽBY\nPayky je lokální-first bitcoinový platební terminál využívající technologii Cashu ecash a související platební infrastrukturu. Odpovídáte za konfiguraci aplikace, výběr mintů a služeb i za nakládání s přijatými prostředky.\n\n3. PŘÍSTUP A OBNOVA\nChraňte své zařízení, přihlašovací údaje, zálohy a veškerá přístupová data k peněženkám nebo mintům. Payky nemůže obnovit ztracené přihlašovací údaje, nedostupné zůstatky u mintů ani prostředky odeslané na nesprávné cíle.\n\n4. BEZ ZÁRUKY\nSoftware je poskytován "tak, jak je", bez jakékoli záruky. Používáte jej na vlastní riziko.\n\n5. OMEZENÍ ODPOVĚDNOSTI\nNeodpovídáme za ztrátu prostředků, přerušení podnikání, selhání platby, chyby v softwaru, chybu uživatele ani selhání mintu nebo služby třetí strany.\n\n6. ECASH MINTY\nEcash tokeny vydávají a proplácejí minty třetích stran. Tyto minty mohou selhat, být nedostupné, změnit podmínky nebo odmítnout proplacení. Zvažte rozložení rizika mezi více mintů a držte jen zůstatky, o které jste připraveni přijít.\n\n7. SOUKROMÍ\nPayky je navrženo tak, aby ukládalo aplikační data lokálně a synchronizovalo je přes Evolu. Platby však mohou být zpracovávány přes ecash minty, Lightning služby nebo jinou infrastrukturu třetích stran, které mohou mít vlastní zásady ochrany soukromí a logy.\n\n8. AKTUALIZACE\nTyto podmínky mohou být aktualizovány. Další používání Payky znamená přijetí aktualizovaných podmínek.\n\nPoslední aktualizace: červen 2026',
  "settings.about.terms.description":
    "Přečtěte si podmínky platné pro používání Payky.",
  "settings.about.terms.heading": "Podmínky používání Payky",
  "settings.about.terms.summary":
    "Přizpůsobeno pro lokální-first bitcoinový platební terminál.",
  "settings.about.terms.title": "Podmínky používání",
  "settings.about.title": "O aplikaci",
  "settings.accountAndSync": "ÚČET A SYNCHRONIZACE",
  "settings.accounts.create.action": "Vytvořit účet",
  "settings.accounts.create.confirm.cancel": "Zrušit",
  "settings.accounts.create.confirm.confirm": "Vytvořit účet",
  "settings.accounts.create.confirm.description":
    "Přepnete se z účtu {name} a založíte úplně nový účet s vlastní recovery phrase.",
  "settings.accounts.create.confirm.title": "Vytvořit nový účet?",
  "settings.accounts.create.description":
    "Vygenerovat novou recovery phrase a přepnout se na tento účet.",
  "settings.accounts.create.title": "Nový účet",
  "settings.accounts.list.active": "Aktivní",
  "settings.accounts.list.createdAt": "Vytvořeno",
  "settings.accounts.list.current": "Aktuální",
  "settings.accounts.list.description":
    "Tyto účty jsou uložené jen v profilu tohoto zařízení.",
  "settings.accounts.list.empty": "Na tomto zařízení nejsou uložené účty.",
  "settings.accounts.list.remove": "Odebrat",
  "settings.accounts.list.switch": "Přepnout",
  "settings.accounts.list.title": "Účty v zařízení",
  "settings.accounts.nav.description":
    "Vyberte, který uživatelský účet je na tomto zařízení aktivní",
  "settings.accounts.nav.title": "Přepnutí uživatelského účtu",
  "settings.accounts.remove.confirm.cancel": "Ponechat účet",
  "settings.accounts.remove.confirm.confirm": "Odebrat účet",
  "settings.accounts.remove.confirm.description":
    "Zařízení tento účet i jeho data zapomene. Vrátit ho zpět jde jen pomocí jeho recovery phrase — bez ní je vše v účtu nadobro ztracené.",
  "settings.accounts.remove.confirm.title": "Odebrat účet {name}?",
  "settings.accounts.restore.action": "Použít recovery phrase",
  "settings.accounts.restore.description":
    "Vložte existující recovery phrase pro otevření jejích aplikačních dat na tomto zařízení.",
  "settings.accounts.restore.mnemonic.description":
    "Mezery se před validací sjednotí.",
  "settings.accounts.restore.mnemonic.invalid":
    "Zadejte platnou SLIP-39 recovery phrase.",
  "settings.accounts.restore.mnemonic.label": "Recovery phrase",
  "settings.accounts.restore.mnemonic.placeholder":
    "academic acid academic agency ...",
  "settings.accounts.restore.mnemonic.required": "Recovery phrase je povinná.",
  "settings.accounts.restore.title": "Existující účet",
  "settings.accounts.title": "Účet aplikace",
  "settings.appVersion": "Verze aplikace:",
  "settings.appVersionCode": "Kód verze:",
  "settings.appearance": "VZHLED A JAZYK",
  "settings.cashRegisterAccount.enabled.description":
    "Když je pokladna povolená, hotovostní platby se mohou přidat k připraveným platbám.",
  "settings.cashRegisterAccount.enabled.label": "Povolit pokladnu",
  "settings.cashRegisterAccount.form.description":
    "Hotovostní platby používají aktuálně vybranou fiat měnu.",
  "settings.cashRegisterAccount.form.title": "Pokladna",
  "settings.catalog": "NABÍDKA",
  "settings.categories.add": "Přidat kategorii",
  "settings.categories.delete": "Smazat kategorii",
  "settings.categories.delete.confirm.cancel": "Zrušit",
  "settings.categories.delete.confirm.confirm": "Smazat",
  "settings.categories.delete.confirm.description":
    "Položky přiřazené ke kategorii {name} se po smazání zobrazí jako nekategorizované.",
  "settings.categories.delete.confirm.title": "Smazat kategorii {name}?",
  "settings.categories.description": "Seskupte své produkty a služby",
  "settings.categories.empty.description":
    "Přidejte kategorie pro seskupení produktů a služeb, poté je přiřaďte ve formuláři položky.",
  "settings.categories.empty.title": "Zatím žádné kategorie",
  "settings.categories.emptySearch": "Hledání nenašlo žádné kategorie.",
  "settings.categories.form.card.description":
    "Název zobrazený při seskupování položek a filtrování na účtu.",
  "settings.categories.form.card.title": "Detaily",
  "settings.categories.form.invalidId": "Neplatné ID kategorie.",
  "settings.categories.form.name.invalid": "Zadejte název.",
  "settings.categories.form.name.label": "Název",
  "settings.categories.form.name.placeholder": "např. Nápoje",
  "settings.categories.form.notFound": "Tato kategorie už neexistuje.",
  "settings.categories.form.save.create": "Přidat kategorii",
  "settings.categories.form.saved.create": "Kategorie přidána.",
  "settings.categories.form.title.create": "Přidat kategorii",
  "settings.categories.form.title.edit": "Upravit kategorii",
  "settings.categories.search": "Hledat kategorie...",
  "settings.categories.search.clear.aria": "Vymazat hledání",
  "settings.categories.title": "Kategorie",
  "settings.debugConsole.clear": "Vymazat",
  "settings.debugConsole.description":
    "Zobrazit zachycený konzolový výstup aplikace",
  "settings.debugConsole.empty":
    "Zatím nejsou zachycené žádné záznamy konzole.",
  "settings.debugConsole.history.title": "Historie výstupu konzole",
  "settings.debugConsole.pause": "Pauza",
  "settings.debugConsole.resume": "Pokračovat",
  "settings.debugConsole.title": "Debug Console",
  "settings.developers": "VÝVOJÁŘI",
  "settings.donations.amount.invalid": "Zadejte kladný celý počet sats.",
  "settings.donations.amount.range": "Částka je mimo povolený rozsah daru.",
  "settings.donations.amount.required": "Zadejte částku daru.",
  "settings.donations.create": "Vytvořit fakturu",
  "settings.donations.create.pending": "Vytvářím fakturu...",
  "settings.donations.description": "Podpořte vývoj Payky",
  "settings.donations.fiat.description": "Používá aktuálně vybranou fiat měnu.",
  "settings.donations.fiat.label": "Částka",
  "settings.donations.form.description":
    "Zadejte jednu částku. Druhé pole se dopočítá podle aktuálního BTC kurzu.",
  "settings.donations.form.title": "Částka daru",
  "settings.donations.history.amount": "{amount} sats",
  "settings.donations.history.empty.description":
    "Dary se zde zobrazí, jakmile nějaký přijde.",
  "settings.donations.history.empty.title": "Zatím žádné dary",
  "settings.donations.history.error": "Historii darů se nepodařilo načíst.",
  "settings.donations.history.item": "Dar",
  "settings.donations.history.loadMore": "Načíst další",
  "settings.donations.history.loadMore.pending": "Načítám...",
  "settings.donations.history.title": "Poslední dary",
  "settings.donations.invoice.backToSettings": "Zpět do nastavení",
  "settings.donations.invoice.copied": "Faktura zkopírována.",
  "settings.donations.invoice.copy": "Zkopírovat fakturu",
  "settings.donations.invoice.copyFailed": "Fakturu se nepodařilo zkopírovat.",
  "settings.donations.invoice.description":
    "Naskenujte tuto Lightning fakturu pro zaplacení.",
  "settings.donations.invoice.error": "Fakturu pro dar se nepodařilo vytvořit.",
  "settings.donations.invoice.missing": "Faktura pro dar chybí.",
  "settings.donations.invoice.openWallet": "Otevřít v peněžence",
  "settings.donations.invoice.title": "Lightning faktura",
  "settings.donations.invoice.verify.error": "Platbu se nepodařilo ověřit.",
  "settings.donations.invoice.verify.paid": "Platba přijata",
  "settings.donations.invoice.verify.paid.description":
    "Děkujeme za podporu vývoje této aplikace.",
  "settings.donations.invoice.verify.waiting": "Čekám na platbu...",
  "settings.donations.metadata.error":
    "Darovací Lightning adresu se nepodařilo načíst.",
  "settings.donations.rate.error": "BTC kurz se nepodařilo načíst.",
  "settings.donations.sats.description": "Jen celé sats.",
  "settings.donations.sats.label": "Sats",
  "settings.donations.sats.range": "Povolený rozsah: {min}-{max} sats.",
  "settings.donations.title": "Dary",
  "settings.evoluExport.action": "Exportovat",
  "settings.evoluExport.action.pending": "Exportuji...",
  "settings.evoluExport.confirm.description":
    "Export bude uložený bez anonymizace.",
  "settings.evoluExport.confirm.label":
    "Rozumím, že export může obsahovat citlivá data.",
  "settings.evoluExport.database.app": "Aplikační databáze",
  "settings.evoluExport.database.app.description":
    "Business data, záznamy plateb, metadata peněženky, nastavení účtu a konfigurace pluginů pro aktivní účet.",
  "settings.evoluExport.database.device": "Databáze zařízení",
  "settings.evoluExport.database.device.description":
    "Lokální profil zařízení, aplikační účty, recovery phrase a nastavení synchronizačních transportů uložené na tomto zařízení.",
  "settings.evoluExport.description":
    "Export lokálních Evolu databází pro zálohu a podporu",
  "settings.evoluExport.destination.capacitor":
    "Soubory se uloží do Documents/ na tomto zařízení.",
  "settings.evoluExport.destination.web": "Soubory stáhne tento prohlížeč.",
  "settings.evoluExport.format.description":
    "Každá vybraná databáze se exportuje jako surový SQLite soubor.",
  "settings.evoluExport.format.sqlite": "SQLite",
  "settings.evoluExport.options.description":
    "Vyberte, které lokální databáze se mají zahrnout.",
  "settings.evoluExport.options.format": "Formát",
  "settings.evoluExport.options.scope": "Rozsah exportu",
  "settings.evoluExport.options.title": "Nastavení exportu",
  "settings.evoluExport.status.createdAt": "Vytvořeno {createdAt}",
  "settings.evoluExport.status.error": "Export selhal.",
  "settings.evoluExport.status.savedTo": "Uloženo do {path}",
  "settings.evoluExport.status.success": "Export dokončen.",
  "settings.evoluExport.status.title": "Stav exportu",
  "settings.evoluExport.title": "Evolu Export",
  "settings.evoluExport.warning.businessData": "obchodní data",
  "settings.evoluExport.warning.description":
    "Full export databází může obsahovat data, která umožňují přístup k prostředkům, integracím nebo soukromé obchodní historii. Exportované soubory ukládejte bezpečně a sdílejte je jen s důvěryhodnými příjemci.",
  "settings.evoluExport.warning.localConfiguration":
    "lokální konfigurace aplikace a nastavení synchronizace",
  "settings.evoluExport.warning.payments": "účtenky, platby a transakce",
  "settings.evoluExport.warning.secrets":
    "mnemoniky peněženek, recovery phrase a API tokeny",
  "settings.evoluExport.warning.title": "Citlivý export",
  "settings.evoluExport.warning.walletMetadata":
    "metadata související s peněženkou",
  "settings.fiat.czk.description":
    "Používat českou korunu pro částky v terminálu",
  "settings.fiat.czk.title": "Česká koruna",
  "settings.fiat.description": "Vyberte výchozí fiat měnu",
  "settings.fiat.eur.description": "Používat euro pro částky v terminálu",
  "settings.fiat.eur.title": "Euro",
  "settings.fiat.mode.description":
    "Vyberte fiat měnu, která se použije jako výchozí při vytváření plateb.",
  "settings.fiat.mode.title": "Výchozí fiat měna",
  "settings.fiat.title": "Fiat měna",
  "settings.fiat.usd.description":
    "Používat americký dolar pro částky v terminálu",
  "settings.fiat.usd.title": "Americký dolar",
  "settings.fiatBankAccount.advanced": "Pokročilé volby",
  "settings.fiatBankAccount.currency.description":
    "Platby v této měně mohou použít tento bankovní účet.",
  "settings.fiatBankAccount.currency.label": "Měna bankovního účtu",
  "settings.fiatBankAccount.enabled.description":
    "Vypnutý účet zůstane uložený, ale platební toky ho budou ignorovat.",
  "settings.fiatBankAccount.enabled.label": "Povolit fiat bankovní účet",
  "settings.fiatBankAccount.form.description":
    "Aplikace teď používá jeden deterministický fiat bankovní účet.",
  "settings.fiatBankAccount.form.title": "Údaje bankovního účtu",
  "settings.fiatBankAccount.iban.description":
    "Zadejte IBAN nebo české číslo účtu, například 123456789/0100. Uložená hodnota se normalizuje na IBAN.",
  "settings.fiatBankAccount.iban.invalid":
    "Zadejte platný IBAN nebo české číslo účtu.",
  "settings.fiatBankAccount.iban.label": "IBAN nebo číslo účtu",
  "settings.fiatBankAccount.iban.required":
    "Zadejte IBAN nebo číslo účtu, nebo bankovní převod vypněte.",
  "settings.fiatBankAccount.qrFormat.description":
    "Tento formát se u bankovních QR plateb zobrazí jako první.",
  "settings.fiatBankAccount.qrFormat.label": "Výchozí formát QR",
  "settings.fiatBankAccount.qrFormat.payBySquare1_0_0":
    "Pay by square 1.0 (Slovensko)",
  "settings.fiatBankAccount.qrFormat.payBySquare1_2_0":
    "Pay by square 1.2 (Slovensko)",
  "settings.fiatBankAccount.qrFormat.spayd": "SPAYD (Česko)",
  "settings.fioPlugin.active.description":
    "Když je plugin zapnutý, kontroluje transakce Fio banky pro fiat bankovní účet.",
  "settings.fioPlugin.active.label": "Povolit Fio plugin",
  "settings.fioPlugin.description":
    "Nastavení tokenů pro synchronizaci transakcí z Fio banky",
  "settings.fioPlugin.form.description":
    "Plugin teď používá deterministický fiat bankovní účet.",
  "settings.fioPlugin.form.title": "Základní nastavení",
  "settings.fioPlugin.interval.description":
    "Jak často má plugin kontrolovat nové transakce.",
  "settings.fioPlugin.interval.invalid": "Zadejte celé číslo větší než nula.",
  "settings.fioPlugin.interval.label": "Sekund mezi kontrolami",
  "settings.fioPlugin.lastSyncedDate.description":
    "Lokální zarážka synchronizace. Pokud ještě neexistuje, použije se včerejší datum.",
  "settings.fioPlugin.lastSyncedDate.invalid": "Zadejte platné datum.",
  "settings.fioPlugin.lastSyncedDate.label": "Poslední synchronizované datum",
  "settings.fioPlugin.nativeRuntimeWarning.description":
    "Tato aplikace teď běží v běžném prohlížeči/PWA prostředí, takže automatické kontroly plateb Fio se tady nespustí.",
  "settings.fioPlugin.nativeRuntimeWarning.title":
    "Fio plugin je dostupný jen v nativní aplikaci.",
  "settings.fioPlugin.syncLookbackDays.description":
    "Kolik dní před poslední lokální zarážkou se má znovu kontrolovat.",
  "settings.fioPlugin.syncLookbackDays.invalid":
    "Zadejte celé číslo větší než nula.",
  "settings.fioPlugin.syncLookbackDays.label": "Dny zpětné kontroly",
  "settings.fioPlugin.title": "Fio plugin",
  "settings.fioPlugin.token.description":
    "Nechte prázdné, pokud chcete uložit jen základní nastavení.",
  "settings.fioPlugin.token.invalid":
    "Zadejte token dlouhý maximálně 255 znaků.",
  "settings.fioPlugin.token.label": "Fio API token",
  "settings.fioPlugin.token.required":
    "Při vytváření pluginu je první token povinný.",
  "settings.fioPlugin.tokens.active": "Aktivní",
  "settings.fioPlugin.tokens.add.description":
    "Ukládá se samostatně, takže nastavení výše se dá měnit bez přepsání tokenu. Sync job prochází všechny uložené tokeny.",
  "settings.fioPlugin.tokens.add.saved": "Fio API token přidán.",
  "settings.fioPlugin.tokens.add.submit": "Přidat token",
  "settings.fioPlugin.tokens.add.title": "Přidat token",
  "settings.fioPlugin.tokens.description":
    "Uložené tokeny se používají při kontrole transakcí účtu.",
  "settings.fioPlugin.tokens.empty": "Nejsou uložené žádné tokeny.",
  "settings.fioPlugin.tokens.item": "Fio API token",
  "settings.fioPlugin.tokens.remove": "Odebrat",
  "settings.fioPlugin.tokens.title": "Tokeny",
  "settings.items.add": "Přidat položku",
  "settings.items.category.all": "Vše",
  "settings.items.category.uncategorized": "Bez kategorie",
  "settings.items.delete": "Smazat položku",
  "settings.items.delete.confirm.cancel": "Zrušit",
  "settings.items.delete.confirm.confirm": "Smazat",
  "settings.items.delete.confirm.description":
    "Účty a platby, ve kterých byla položka {name} už použita, si ponechají vlastní kopii, ale nebude ji možné přidat do nových.",
  "settings.items.delete.confirm.title": "Smazat položku {name}?",
  "settings.items.description": "Správa prodávaných produktů a služeb",
  "settings.items.empty.description":
    "Přidejte produkty nebo služby, které prodáváte, abyste je mohli rychle přidávat do účtu.",
  "settings.items.empty.title": "Zatím žádné položky",
  "settings.items.emptySearch": "Hledání nenašlo žádné položky.",
  "settings.items.form.card.description":
    "Název, cena a nepovinný popis zobrazený při přidávání položky do účtu.",
  "settings.items.form.card.title": "Detaily",
  "settings.items.form.category.label": "Kategorie",
  "settings.items.form.category.none": "Bez kategorie",
  "settings.items.form.currency.label": "Měna",
  "settings.items.form.description.invalid":
    "Popis je příliš dlouhý (max. 255 znaků).",
  "settings.items.form.description.label": "Popis",
  "settings.items.form.description.placeholder": "Nepovinné",
  "settings.items.form.internalDescription.invalid":
    "Interní popis je příliš dlouhý (max. 255 znaků).",
  "settings.items.form.internalDescription.label": "Interní popis",
  "settings.items.form.internalDescription.placeholder":
    "Nepovinné – viditelné pouze pro personál",
  "settings.items.form.internalName.hint":
    "Zobrazí se personálu místo veřejného názvu. Zákazníci na účtu stále vidí veřejný název a popis.",
  "settings.items.form.internalName.invalid":
    "Interní název je příliš dlouhý (max. 255 znaků).",
  "settings.items.form.internalName.label": "Interní název",
  "settings.items.form.internalName.placeholder":
    "Nepovinné – zobrazí se personálu místo veřejného názvu",
  "settings.items.form.invalidId": "Neplatné ID položky.",
  "settings.items.form.name.invalid": "Zadejte název.",
  "settings.items.form.name.label": "Název",
  "settings.items.form.name.placeholder": "např. Káva",
  "settings.items.form.notFound": "Tato položka už neexistuje.",
  "settings.items.form.price.invalid": "Zadejte platnou cenu.",
  "settings.items.form.price.label": "Cena",
  "settings.items.form.save.create": "Přidat položku",
  "settings.items.form.saved.create": "Položka byla přidána.",
  "settings.items.form.scanCode.duplicate": "Už je přiřazen položce {name}.",
  "settings.items.form.scanCode.invalid": "Zadejte platný kód.",
  "settings.items.form.scanCode.label": "Kód pro skenování",
  "settings.items.form.scanCode.placeholder": "např. 8594001234567",
  "settings.items.form.scanCode.scan.aria": "Naskenovat kód",
  "settings.items.form.sku.invalid": "SKU je příliš dlouhé (max. 255 znaků).",
  "settings.items.form.sku.label": "SKU",
  "settings.items.form.sku.placeholder": "Nepovinné",
  "settings.items.form.taxRate.description":
    "Uplatní se na účtech a platbách po použití této položky. Sazby správte v Nastavení › Daňové sazby.",
  "settings.items.form.taxRate.label": "Daňová sazba",
  "settings.items.form.taxRate.none": "Bez daňové sazby",
  "settings.items.form.title.create": "Přidat položku",
  "settings.items.form.title.edit": "Upravit položku",
  "settings.items.search": "Hledat položky...",
  "settings.items.search.clear.aria": "Vymazat hledání",
  "settings.items.title": "Položky",
  "settings.language.czech.description": "Používat české překlady",
  "settings.language.czech.title": "Čeština",
  "settings.language.description": "Vyberte jazyk aplikace a region",
  "settings.language.english.description": "Používat anglické překlady",
  "settings.language.english.title": "Angličtina",
  "settings.language.locale.czech.description":
    "Používat české formátování dat, čísel a měn",
  "settings.language.locale.czech.title": "Česko",
  "settings.language.locale.description":
    "Vyberte regionální formát pro data, čísla a měny.",
  "settings.language.locale.english.description":
    "Používat americké formátování dat, čísel a měn",
  "settings.language.locale.english.title": "Spojené státy",
  "settings.language.locale.slovak.description":
    "Používat slovenské formátování dat, čísel a měn",
  "settings.language.locale.slovak.title": "Slovensko",
  "settings.language.locale.title": "Regionální formát",
  "settings.language.mode.description":
    "Vyberte jazyk, který má aplikace používat.",
  "settings.language.mode.title": "Jazyk aplikace",
  "settings.language.slovak.description": "Používat slovenské překlady",
  "settings.language.slovak.title": "Slovenština",
  "settings.language.title": "Jazyk a region",
  "settings.legalEntity.country.label": "Země",
  "settings.legalEntity.country.placeholder": "Vyberte zemi",
  "settings.legalEntity.description":
    "Určuje zemi pro výchozí daňové sazby a to, zda se sazby uplatňují u položek katalogu.",
  "settings.legalEntity.title": "Země a DPH",
  "settings.legalEntity.vatPayer.description":
    "Přidá daňové sazby k položkám katalogu.",
  "settings.legalEntity.vatPayer.label": "Jsem plátce DPH",
  "settings.paymentAccounts.description":
    "Nastavení bankovního, Spark a pokladního účtu",
  "settings.paymentAccounts.default": "Výchozí",
  "settings.paymentAccounts.method.cashRegister": "Hotovost",
  "settings.paymentAccounts.method.iban": "Bankovní převod",
  "settings.paymentAccounts.method.spark": "Bitcoin",
  "settings.paymentAccounts.moveDown.aria": "Posunout {name} dolů",
  "settings.paymentAccounts.moveUp.aria": "Posunout {name} nahoru",
  "settings.paymentAccounts.order.description":
    "Zákazník uvidí platební metody v tomto pořadí. První dostupná se otevře automaticky.",
  "settings.paymentAccounts.status.currencyMismatch":
    "Nastaveno v {currency}, aplikace ale používá {appCurrency}",
  "settings.paymentAccounts.status.missingIban":
    "Pro zapnutí doplňte bankovní účet",
  "settings.paymentAccounts.title": "Platební účty",
  "settings.paymentNumberSeries.day.default.description":
    "Přidat do generovaných čísel plateb dvouciferný den",
  "settings.paymentNumberSeries.day.default.title": "Zobrazit den",
  "settings.paymentNumberSeries.day.hidden.description":
    "Nepřidávat den do generovaných čísel plateb",
  "settings.paymentNumberSeries.day.hidden.title": "Skrýt den",
  "settings.paymentNumberSeries.day.label": "Formát dne",
  "settings.paymentNumberSeries.description":
    "Nastavení generování čísel plateb",
  "settings.paymentNumberSeries.form.description":
    "Tyto hodnoty určují deterministickou číselnou řadu používanou terminálem.",
  "settings.paymentNumberSeries.form.title": "Formát číselné řady",
  "settings.paymentNumberSeries.lastNumber.date.description":
    "Kotevní datum pro rozhodnutí, jestli další platba pokračuje v řadě, nebo ji resetuje. Prázdná hodnota resetuje řadu při další platbě.",
  "settings.paymentNumberSeries.lastNumber.date.invalid":
    "Zadejte platné datum.",
  "settings.paymentNumberSeries.lastNumber.date.label": "Kotevní datum",
  "settings.paymentNumberSeries.lastNumber.description":
    "Přenastavení posledního použitého pořadového čísla. Další vygenerované číslo platby bude pokračovat od této hodnoty.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.description":
    "Poslední použité pořadové číslo. Například zadejte 499, pokud další platba má použít 500.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.invalid":
    "Zadejte nulu nebo kladné celé číslo.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.label":
    "Poslední pořadové číslo",
  "settings.paymentNumberSeries.lastNumber.title": "Poslední použité číslo",
  "settings.paymentNumberSeries.month.default.description":
    "Přidat do generovaných čísel plateb dvouciferný měsíc",
  "settings.paymentNumberSeries.month.default.title": "Zobrazit měsíc",
  "settings.paymentNumberSeries.month.hidden.description":
    "Nepřidávat měsíc do generovaných čísel plateb",
  "settings.paymentNumberSeries.month.hidden.title": "Skrýt měsíc",
  "settings.paymentNumberSeries.month.label": "Formát měsíce",
  "settings.paymentNumberSeries.prefix.description":
    "Volitelná předpona přidaná před generovaná čísla plateb.",
  "settings.paymentNumberSeries.prefix.invalid":
    "Zadejte předponu dlouhou maximálně 255 znaků.",
  "settings.paymentNumberSeries.prefix.label": "Předpona",
  "settings.paymentNumberSeries.serialNumberDigits.description":
    "Minimální počet číslic pro rostoucí pořadovou část.",
  "settings.paymentNumberSeries.serialNumberDigits.invalid":
    "Zadejte celé číslo větší než nula.",
  "settings.paymentNumberSeries.serialNumberDigits.label":
    "Počet číslic pořadí",
  "settings.paymentNumberSeries.title": "Číselná řada plateb",
  "settings.paymentNumberSeries.year.default.description":
    "Přidat do generovaných čísel plateb celý čtyřciferný rok",
  "settings.paymentNumberSeries.year.default.title": "Celý rok",
  "settings.paymentNumberSeries.year.label": "Formát roku",
  "settings.paymentNumberSeries.year.short.description":
    "Přidat do generovaných čísel plateb krátký dvouciferný rok",
  "settings.paymentNumberSeries.year.short.title": "Krátký rok",
  "settings.payments": "PLATBY",
  "settings.privacy.description": "Správa hlášení chyb",
  "settings.privacy.errorReporting.description":
    "Odesílat hlášení pádů a chyb, aby se daly snadněji opravit. Ve výchozím stavu vypnuto — nic se neodesílá, dokud to nezapnete.",
  "settings.privacy.errorReporting.disable": "Vypnout",
  "settings.privacy.errorReporting.disabled": "Vypnuto",
  "settings.privacy.errorReporting.enable": "Zapnout",
  "settings.privacy.errorReporting.enabled": "Zapnuto",
  "settings.privacy.errorReporting.title": "Hlášení chyb",
  "settings.privacy.title": "Soukromí",
  "settings.privacyGroup": "SOUKROMÍ",
  "settings.saveFailed": "Změnu se nepodařilo uložit. Zkuste to prosím znovu.",
  "settings.security.description": "Správa synchronizace a obnovy účtu",
  "settings.security.mnemonic.copied": "Recovery phrase zkopírována.",
  "settings.security.mnemonic.copy": "Kopírovat",
  "settings.security.mnemonic.copyError":
    "Recovery phrase se nepodařilo zkopírovat.",
  "settings.security.mnemonic.description":
    "Zobrazení recovery phrase pro aktivní lokální účet.",
  "settings.security.mnemonic.help":
    "Udržujte tuto frázi v soukromí. Kdo ji zná, může účet obnovit.",
  "settings.security.mnemonic.label": "Recovery phrase",
  "settings.security.mnemonic.title": "Obnova účtu",
  "settings.security.mnemonic.warning":
    "Pokud tuto frázi ztratíte, tento účet a jeho data už nikdy nepůjde obnovit – ani nám se to nepodaří.",
  "settings.security.title": "Bezpečnost a synchronizace",
  "settings.security.transports.activate": "Aktivovat",
  "settings.security.transports.active": "Aktivní",
  "settings.security.transports.add": "Přidat transport",
  "settings.security.transports.deactivate": "Deaktivovat",
  "settings.security.transports.description":
    "Nastavení Evolu WebSocket endpointů pro tento device účet.",
  "settings.security.transports.empty": "Nejsou uložené žádné transporty.",
  "settings.security.transports.footer":
    "Neaktivní transporty zůstanou uložené, ale při otevírání aplikačních dat se ignorují.",
  "settings.security.transports.inactive": "Neaktivní",
  "settings.security.transports.saved": "Transport přidán.",
  "settings.security.transports.title": "Evolu transporty",
  "settings.security.transports.url.description":
    "Povolené jsou jen zabezpečené WebSocket URL začínající na wss:.",
  "settings.security.transports.url.invalid": "Zadejte platnou wss URL.",
  "settings.security.transports.url.label": "WebSocket URL",
  "settings.security.transports.websocket": "WebSocket",
  "settings.sparkAccount.enabled.description":
    "Vypnutý Spark účet zůstane uložený, ale platební toky ho budou ignorovat.",
  "settings.sparkAccount.enabled.label": "Povolit Spark účet",
  "settings.sparkAccount.advanced": "Pokročilé volby",
  "settings.sparkAccount.form.customDescription":
    "Payky přijímá Spark platby do vaší vlastní peněženky.",
  "settings.sparkAccount.form.description":
    "Payky tuto Spark peněženku odvodí z klíče pro obnovu účtu.",
  "settings.sparkAccount.form.title": "Spark účet",
  "settings.sparkAccount.mnemonic.description":
    "Mnemonic uchovejte v tajnosti. Kdokoli s ním má přístup ke Spark peněžence.",
  "settings.sparkAccount.mnemonic.label": "Mnemonic peněženky",
  "settings.sparkAccount.privacyMode.description":
    "Zapne režim soukromí Spark peněženky pro Lightning platby.",
  "settings.sparkAccount.privacyMode.label": "Zapnout privacy mode",
  "settings.sparkAccount.privacyMode.loadError":
    "Nastavení privacy mode ve Sparku se nepodařilo načíst.",
  "settings.sparkAccount.privacyMode.loading": "Načítám privacy mode...",
  "settings.sparkAccount.syncPointer.description":
    "Lokální ukazatel synchronizace pro periodické přeskenování historie. Pokud ukazatel ještě neexistuje, použije se dnešní datum; přeskenování se z něj dívá jen 72 hodin zpět.",
  "settings.sparkAccount.syncPointer.invalid": "Zadejte platné datum.",
  "settings.sparkAccount.syncPointer.label": "Poslední synchronizované datum",
  "settings.sparkAccount.wallet.cancel": "Zrušit",
  "settings.sparkAccount.wallet.change": "Změnit peněženku…",
  "settings.sparkAccount.wallet.changeDialog.current":
    "Tuto peněženku už používáte.",
  "settings.sparkAccount.wallet.changeDialog.description":
    "Vyberte peněženku, do které mají chodit nové Spark platby.",
  "settings.sparkAccount.wallet.changeDialog.inUse": "Právě se používá.",
  "settings.sparkAccount.wallet.changeDialog.invalid":
    "Toto není platný mnemonic o 12 slovech.",
  "settings.sparkAccount.wallet.changeDialog.title": "Změnit peněženku",
  "settings.sparkAccount.wallet.changeDialog.wordCount": "{value}/12 slov",
  "settings.sparkAccount.wallet.custom.description":
    "Spark peněženka, kterou přidáte jejím 12slovným mnemonicem.",
  "settings.sparkAccount.wallet.custom.title": "Vlastní peněženka",
  "settings.sparkAccount.wallet.label": "Peněženka",
  "settings.sparkAccount.wallet.payky.description":
    "Odvozená z klíče pro obnovu účtu.",
  "settings.sparkAccount.wallet.payky.title": "Peněženka Payky",
  "settings.sparkAccount.wallet.switch": "Přepnout",
  "settings.sparkAccount.wallet.warning.funds":
    "Peníze zůstanou v současné peněžence a tady už nebudou vidět. Nejdřív je vyberte, nebo si uschovejte její mnemonic.",
  "settings.sparkAccount.wallet.warning.invoices":
    "Nezaplacené faktury současné peněženky se už nezaznamenají.",
  "settings.support": "PODPORA A INFORMACE",
  "settings.tables.add": "Přidat stůl",
  "settings.tables.delete": "Smazat stůl",
  "settings.tables.delete.confirm.cancel": "Zrušit",
  "settings.tables.delete.confirm.confirm": "Smazat",
  "settings.tables.delete.confirm.description":
    "Uzavřené účty si stůl {name} ponechají, ale nepůjde ho přiřadit k novým.",
  "settings.tables.delete.confirm.title": "Smazat stůl {name}?",
  "settings.tables.delete.hasOpenBills":
    "Stůl {name} má otevřený účet. Nejdřív ho zaplaťte nebo přesuňte na jiný stůl.",
  "settings.tables.description": "Správa stolů a míst k sezení",
  "settings.tables.empty.description":
    "Přidejte stoly ve svém podniku, abyste k nim mohli přiřazovat účty.",
  "settings.tables.empty.title": "Zatím žádné stoly",
  "settings.tables.emptySearch": "Hledání nenašlo žádné stoly.",
  "settings.tables.form.card.description":
    "Název a počet míst zobrazené při přiřazování stolu k účtu.",
  "settings.tables.form.card.title": "Detaily",
  "settings.tables.form.code.description":
    "Zatím se nepoužívá - rezervováno pro budoucí QR kód, který bude tento stůl identifikovat.",
  "settings.tables.form.code.label": "Kód",
  "settings.tables.form.invalidId": "Neplatné ID stolu.",
  "settings.tables.form.name.invalid": "Zadejte název.",
  "settings.tables.form.name.label": "Název",
  "settings.tables.form.name.placeholder": "např. Stůl 5",
  "settings.tables.form.notFound": "Tento stůl už neexistuje.",
  "settings.tables.form.save.create": "Přidat stůl",
  "settings.tables.form.saved.create": "Stůl přidán.",
  "settings.tables.form.seatCount.invalid": "Zadejte platný počet míst.",
  "settings.tables.form.seatCount.label": "Počet míst",
  "settings.tables.form.seatCount.placeholder": "např. 4",
  "settings.tables.form.title.create": "Přidat stůl",
  "settings.tables.form.title.edit": "Upravit stůl",
  "settings.tables.search": "Hledat stoly...",
  "settings.tables.search.clear.aria": "Vymazat hledání",
  "settings.tables.seatCount": "{value} míst",
  "settings.tables.title": "Stoly",
  "settings.taxRates.activate": "Znovu aktivovat {name}",
  "settings.taxRates.activate.confirm.cancel": "Zrušit",
  "settings.taxRates.activate.confirm.confirm": "Aktivovat",
  "settings.taxRates.activate.confirm.description":
    "{name} bude znovu dostupná při přiřazování daňových sazeb katalogovým položkám.",
  "settings.taxRates.activate.confirm.title": "Znovu aktivovat {name}?",
  "settings.taxRates.add": "Přidat sazbu",
  "settings.taxRates.add.title": "Přidat daňovou sazbu",
  "settings.taxRates.archive": "Archivovat {name}",
  "settings.taxRates.archive.confirm.cancel": "Zrušit",
  "settings.taxRates.archive.confirm.confirm": "Archivovat",
  "settings.taxRates.archive.confirm.description":
    "{name} se skryje z nabídky u nových katalogových položek. Stávající položky ji mají dál, dokud je nezměníte. Později ji lze znovu aktivovat.",
  "settings.taxRates.archive.confirm.title": "Archivovat {name}?",
  "settings.taxRates.archived.title": "Archivované",
  "settings.taxRates.default.set": "Nastavit {name} jako výchozí",
  "settings.taxRates.default.unset": "Zrušit {name} jako výchozí",
  "settings.taxRates.description":
    "Sazbu po vytvoření nelze upravit ani smazat — místo změny procenta ji archivujte a založte novou, pokud se sazba reálně změní.",
  "settings.taxRates.empty": "Zatím žádné daňové sazby.",
  "settings.taxRates.name.invalid": "Zadejte název.",
  "settings.taxRates.name.label": "Název",
  "settings.taxRates.name.placeholder": "např. Základní sazba",
  "settings.taxRates.rate.description":
    "Procento, např. 21 nebo 12,5. Po uložení již nelze změnit.",
  "settings.taxRates.rate.invalid": "Zadejte procento mezi 0 a 100.",
  "settings.taxRates.rate.label": "Sazba (%)",
  "settings.taxRates.rename": "Přejmenovat {name}",
  "settings.taxRates.rename.input": "Nový název pro {name}",
  "settings.taxRates.title": "Daňové sazby",
  "settings.theme.dark.description": "Vždy použít tmavé rozhraní",
  "settings.theme.dark.title": "Tmavý",
  "settings.theme.description": "Přepínání mezi světlým a tmavým režimem",
  "settings.theme.light.description": "Vždy použít světlé rozhraní",
  "settings.theme.light.title": "Světlý",
  "settings.theme.mode.description":
    "Vyberte pevný motiv nebo nastavení podle zařízení.",
  "settings.theme.mode.title": "Režim vzhledu",
  "settings.theme.system.description": "Řídit se nastavením operačního systému",
  "settings.theme.system.title": "Auto",
  "settings.theme.title": "Motiv",
  "settings.tips.description": "Nastavení spropitného pro účty",
  "settings.tips.enabled.description":
    "Zákazníci mohou při placení přidat spropitné.",
  "settings.tips.enabled.label": "Povolit spropitné",
  "settings.tips.fixedAmounts.add": "Přidat pevnou částku",
  "settings.tips.fixedAmounts.description":
    "Zákazníci mohou při placení vybrat tyto částky v {currency}.",
  "settings.tips.fixedAmounts.duplicate": "Tato pevná částka už je v seznamu.",
  "settings.tips.fixedAmounts.invalid":
    "Zadejte kladnou částku nejvýše se dvěma desetinnými místy.",
  "settings.tips.fixedAmounts.label": "Předvolené pevné částky",
  "settings.tips.fixedAmounts.maximum":
    "Můžete přidat nejvýše čtyři předvolené pevné částky.",
  "settings.tips.fixedAmounts.placeholder": "např. 20,00",
  "settings.tips.form.description":
    "Nastavte rychlé volby spropitného zobrazované při placení.",
  "settings.tips.form.title": "Možnosti spropitného",
  "settings.tips.percentages.add": "Přidat procento",
  "settings.tips.percentages.description":
    "Zákazníci mohou při placení vybrat tato procenta.",
  "settings.tips.percentages.duplicate": "Toto procento už je v seznamu.",
  "settings.tips.percentages.invalid": "Zadejte celé procento od 1 do 100.",
  "settings.tips.percentages.label": "Předvolené procentní hodnoty",
  "settings.tips.percentages.maximum":
    "Můžete přidat nejvýše čtyři předvolené procentní hodnoty.",
  "settings.tips.percentages.placeholder": "např. 15",
  "settings.tips.percentages.value": "{value} %",
  "settings.tips.preset.remove": "Odebrat {value}",
  "settings.tips.reset": "Obnovit výchozí hodnoty",
  "settings.tips.save": "Uložit spropitné",
  "settings.tips.saved": "Nastavení spropitného uloženo.",
  "settings.tips.title": "Spropitné",
  "settings.title": "Nastavení",
  "settings.withdrawals.description":
    "Odeslat Bitcoin ze Spark účtu na on-chain adresu",
  "settings.withdrawals.title": "Výběry",
} satisfies Record<keyof typeof enSettings, string>
