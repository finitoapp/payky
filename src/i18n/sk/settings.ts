import type { enSettings } from "@/i18n/en/settings.ts"

export const skSettings = {
  "settings.about.app.title": "Payky",
  "settings.about.description": "Verzia, podmienky a kontakt",
  "settings.about.github.description": "Zapojte sa do vývoja aplikácie",
  "settings.about.github.title": "Zdrojový kód na GitHube",
  "settings.about.privacy.body":
    "PAYKY - ZÁSADY OCHRANY SÚKROMIA\n\n1. ZBER DÁT\nPayky nepredáva osobné údaje a je navrhnuté tak, aby aplikačné dáta zostávali lokálne vo vašom zariadení. Aplikácia ukladá nastavenia terminálu, katalógové dáta, záznamy platieb a súvisiace prevádzkové dáta lokálne a synchronizuje aplikačné dáta cez Evolu.\n\n2. PLATOBNÉ DÁTA\nPlatobné a terminálové dáta môžu obsahovať sumy, časové údaje, názvy položiek, stav platby, informácie o mintoch, identifikátory zariadení a ďalšie záznamy potrebné na prevádzku bitcoinového platobného terminálu. Chráňte svoje zariadenie, prihlasovacie údaje, zálohy a prístupové dáta k mintom alebo peňaženkám.\n\n3. SIEŤOVÁ KOMUNIKÁCIA\nAplikácia môže komunikovať s:\n- infraštruktúrou Evolu na synchronizáciu lokálnych aplikačných dát\n- Cashu mintmi na vydávanie, preplácanie alebo správu ecash tokenov\n- Lightning alebo peňaženkovými službami používanými na vytvorenie alebo vyrovnanie platieb\n- cenovými alebo kurzovými API, ak je zapnutý fiat prepočet\n\nTieto služby môžu mať vlastné zásady ochrany súkromia, logy a pravidlá uchovávania dát.\n\n4. ANALYTIKA A HLÁSENIE CHÝB\nPayky nepoužíva analytické ani sledovacie služby. K dispozícii je voliteľné hlásenie chýb cez Sentry, ktoré pomáha diagnostikovať pády a chyby aplikácie. Je vo východiskovom stave vypnuté a aktivuje sa len vtedy, keď ho zapnete v Nastavenia > Súkromie. Po zapnutí môžu hlásenia chýb obsahovať informácie o zariadení a aplikácii a chybové správy a stack trace; obnovovacie frázy a čísla bankových účtov sú pred odoslaním automaticky redigované.\n\n5. MINTY TRETÍCH STRÁN\nPri používaní ecash mintov môže prevádzkovateľ mintu vidieť sumy transakcií, časovanie, aktivitu preplácania tokenov a súvisiace metadáta. Vyberajte dôveryhodné minty a nedržte zbytočné zostatky u jedného mintu.\n\n6. ZÁLOHY A SYNCHRONIZÁCIA\nAk sú zapnuté synchronizačné alebo zálohovacie funkcie, aplikačné dáta môžu byť prenášané do synchronizačnej infraštruktúry. So synchronizovanými dátami zaobchádzajte ako s prevádzkovými obchodnými dátami a chráňte každé zariadenie, ktoré k nim má prístup.\n\n7. KONTAKT\nKontaktné údaje pre otázky súkromia budú zverejnené v dokumentácii projektu.\n\nPosledná aktualizácia: jún 2026",
  "settings.about.privacy.description":
    "Dáta aplikácie sa ukladajú lokálne a synchronizujú cez Evolu.",
  "settings.about.privacy.heading": "Zásady ochrany súkromia Payky",
  "settings.about.privacy.summary":
    "Prispôsobené pre lokálny bitcoinový platobný terminál.",
  "settings.about.privacy.title": "Dáta a súkromie",
  "settings.about.terms.body":
    'PAYKY - PODMIENKY POUŽÍVANIA\n\n1. PRIJATIE\nPoužívaním tejto aplikácie platobného terminálu súhlasíte s týmito podmienkami.\n\n2. POVAHA SLUŽBY\nPayky je lokálny bitcoinový platobný terminál využívajúci technológiu Cashu ecash a súvisiacu platobnú infraštruktúru. Zodpovedáte za konfiguráciu aplikácie, výber mintov a služieb aj za nakladanie s prijatými prostriedkami.\n\n3. PRÍSTUP A OBNOVA\nChráňte svoje zariadenie, prihlasovacie údaje, zálohy a všetky prístupové dáta k peňaženkám alebo mintom. Payky nemôže obnoviť stratené prihlasovacie údaje, nedostupné zostatky u mintov ani prostriedky odoslané na nesprávne ciele.\n\n4. BEZ ZÁRUKY\nSoftvér sa poskytuje "tak, ako je", bez akejkoľvek záruky. Používate ho na vlastné riziko.\n\n5. OBMEDZENIE ZODPOVEDNOSTI\nNezodpovedáme za stratu prostriedkov, prerušenie podnikania, zlyhanie platby, chyby v softvéri, chybu používateľa ani zlyhanie mintu alebo služby tretej strany.\n\n6. ECASH MINTY\nEcash tokeny vydávajú a preplácajú minty tretích strán. Tieto minty môžu zlyhať, byť nedostupné, zmeniť podmienky alebo odmietnuť preplatenie. Zvážte rozloženie rizika medzi viac mintov a držte len zostatky, o ktoré ste pripravení prísť.\n\n7. SÚKROMIE\nPayky je navrhnuté tak, aby ukladalo aplikačné dáta lokálne a synchronizovalo ich cez Evolu. Platby však môžu byť spracovávané cez ecash minty, Lightning služby alebo inú infraštruktúru tretích strán, ktoré môžu mať vlastné zásady ochrany súkromia a logy.\n\n8. AKTUALIZÁCIE\nTieto podmienky môžu byť aktualizované. Ďalšie používanie Payky znamená prijatie aktualizovaných podmienok.\n\nPosledná aktualizácia: jún 2026',
  "settings.about.terms.description":
    "Prečítajte si podmienky platné pri používaní Payky.",
  "settings.about.terms.heading": "Podmienky používania Payky",
  "settings.about.terms.summary":
    "Prispôsobené pre lokálny bitcoinový platobný terminál.",
  "settings.about.terms.title": "Podmienky používania",
  "settings.about.title": "O aplikácii",
  "settings.accountAndSync": "ÚČET A SYNCHRONIZÁCIA",
  "settings.accounts.create.action": "Vytvoriť účet",
  "settings.accounts.create.confirm.cancel": "Zrušiť",
  "settings.accounts.create.confirm.confirm": "Vytvoriť účet",
  "settings.accounts.create.confirm.description":
    "Prepnete sa z účtu {name} a založíte úplne nový účet s vlastnou recovery phrase.",
  "settings.accounts.create.confirm.title": "Vytvoriť nový účet?",
  "settings.accounts.create.description":
    "Vygenerovať novú recovery phrase a prepnúť sa na tento účet.",
  "settings.accounts.create.title": "Nový účet",
  "settings.accounts.list.active": "Aktívny",
  "settings.accounts.list.createdAt": "Vytvorené",
  "settings.accounts.list.current": "Aktuálny",
  "settings.accounts.list.description":
    "Tieto účty sú uložené iba v profile tohto zariadenia.",
  "settings.accounts.list.empty": "Na tomto zariadení nie sú uložené účty.",
  "settings.accounts.list.remove": "Odobrať",
  "settings.accounts.list.switch": "Prepnúť",
  "settings.accounts.list.title": "Účty v zariadení",
  "settings.accounts.nav.description":
    "Vyberte, ktorý používateľský účet je na tomto zariadení aktívny",
  "settings.accounts.nav.title": "Prepnutie používateľského účtu",
  "settings.accounts.remove.confirm.cancel": "Ponechať účet",
  "settings.accounts.remove.confirm.confirm": "Odobrať účet",
  "settings.accounts.remove.confirm.description":
    "Zariadenie tento účet aj jeho údaje zabudne. Vrátiť ho späť ide len pomocou jeho recovery phrase — bez nej je všetko v účte nadobro stratené.",
  "settings.accounts.remove.confirm.title": "Odobrať účet {name}?",
  "settings.accounts.restore.action": "Použiť recovery phrase",
  "settings.accounts.restore.description":
    "Vložte existujúcu recovery phrase na otvorenie jej aplikačných dát na tomto zariadení.",
  "settings.accounts.restore.mnemonic.description":
    "Medzery sa pred validáciou zjednotia.",
  "settings.accounts.restore.mnemonic.invalid":
    "Zadajte platnú SLIP-39 recovery phrase.",
  "settings.accounts.restore.mnemonic.label": "Recovery phrase",
  "settings.accounts.restore.mnemonic.placeholder":
    "academic acid academic agency ...",
  "settings.accounts.restore.mnemonic.required": "Recovery phrase je povinná.",
  "settings.accounts.restore.title": "Existujúci účet",
  "settings.accounts.title": "Účet aplikácie",
  "settings.appVersion": "Verzia aplikácie:",
  "settings.appVersionCode": "Kód verzie:",
  "settings.appearance": "VZHĽAD A JAZYK",
  "settings.cashRegisterAccount.enabled.description":
    "Keď je pokladnica povolená, hotovostné platby sa môžu pridať k pripraveným platbám.",
  "settings.cashRegisterAccount.enabled.label": "Povoliť pokladnicu",
  "settings.cashRegisterAccount.form.description":
    "Hotovostné platby používajú aktuálne vybranú fiat menu.",
  "settings.cashRegisterAccount.form.title": "Pokladna",
  "settings.cardSwitchioAccount.enabled.label": "Zapnúť platobný terminál",
  "settings.cardSwitchioAccount.info.contract":
    "uzavretú zmluvu s poskytovateľom platobného riešenia, napríklad Comgate.",
  "settings.cardSwitchioAccount.info.description":
    "Na prijímanie platieb platobnou kartou potrebujete:",
  "settings.cardSwitchioAccount.info.softpos":
    "aplikáciu Switchio SoftPOS na tomto zariadení,",
  "settings.cardSwitchioAccount.info.softposLink":
    "O aplikácii Switchio SoftPOS",
  "settings.cardSwitchioAccount.info.title": "Platby platobnou kartou",
  "settings.cardSwitchioAccount.nativeRuntimeWarning":
    "Platobný terminál je dostupný len v natívnej aplikácii.",
  "settings.catalog": "PONUKA",
  "settings.categories.add": "Pridať kategóriu",
  "settings.categories.delete": "Vymazať kategóriu",
  "settings.categories.delete.confirm.cancel": "Zrušiť",
  "settings.categories.delete.confirm.confirm": "Vymazať",
  "settings.categories.delete.confirm.description":
    "Položky priradené ku kategórii {name} sa po vymazaní zobrazia ako nekategorizované.",
  "settings.categories.delete.confirm.title": "Vymazať kategóriu {name}?",
  "settings.categories.description": "Zoskupte svoje produkty a služby",
  "settings.categories.empty.description":
    "Pridajte kategórie na zoskupenie produktov a služieb, potom ich priraďte vo formulári položky.",
  "settings.categories.empty.title": "Zatiaľ žiadne kategórie",
  "settings.categories.emptySearch": "Vyhľadávanie nenašlo žiadne kategórie.",
  "settings.categories.form.card.description":
    "Názov zobrazený pri zoskupovaní položiek a filtrovaní na účte.",
  "settings.categories.form.card.title": "Detaily",
  "settings.categories.form.invalidId": "Neplatné ID kategórie.",
  "settings.categories.form.name.invalid": "Zadajte názov.",
  "settings.categories.form.name.label": "Názov",
  "settings.categories.form.name.placeholder": "napr. Nápoje",
  "settings.categories.form.notFound": "Táto kategória už neexistuje.",
  "settings.categories.form.save.create": "Pridať kategóriu",
  "settings.categories.form.saved.create": "Kategória pridaná.",
  "settings.categories.form.title.create": "Pridať kategóriu",
  "settings.categories.form.title.edit": "Upraviť kategóriu",
  "settings.categories.search": "Hľadať kategórie...",
  "settings.categories.search.clear.aria": "Vymazať hľadanie",
  "settings.categories.title": "Kategórie",
  "settings.debugConsole.clear": "Vymazať",
  "settings.debugConsole.description":
    "Zobraziť zachytený konzolový výstup aplikácie",
  "settings.debugConsole.empty":
    "Zatiaľ nie sú zachytené žiadne záznamy konzoly.",
  "settings.debugConsole.history.title": "Historie výstupu konzole",
  "settings.debugConsole.pause": "Pozastaviť",
  "settings.debugConsole.resume": "Pokračovať",
  "settings.debugConsole.title": "Debug Console",
  "settings.developers": "VÝVOJÁRI",
  "settings.donations.amount.invalid": "Zadajte kladný celý počet sats.",
  "settings.donations.amount.range": "Suma je mimo povolený rozsah daru.",
  "settings.donations.amount.required": "Zadajte sumu daru.",
  "settings.donations.create": "Vytvoriť faktúru",
  "settings.donations.create.pending": "Vytváram faktúru...",
  "settings.donations.description": "Podporte vývoj Payky",
  "settings.donations.fiat.description": "Používa aktuálne vybranú fiat menu.",
  "settings.donations.fiat.label": "Suma",
  "settings.donations.form.description":
    "Zadajte jednu sumu. Druhé pole sa dopočíta podľa aktuálneho BTC kurzu.",
  "settings.donations.form.title": "Suma daru",
  "settings.donations.history.amount": "{amount} sats",
  "settings.donations.history.empty.description":
    "Dary sa tu zobrazia, akonáhle nejaký príde.",
  "settings.donations.history.empty.title": "Zatiaľ žiadne dary",
  "settings.donations.history.error": "Históriu darov sa nepodarilo načítať.",
  "settings.donations.history.retry": "Skúsiť znova",
  "settings.donations.history.title": "Posledné dary",
  "settings.donations.invoice.backToSettings": "Späť do nastavení",
  "settings.donations.invoice.copied": "Faktúra skopírovaná.",
  "settings.donations.invoice.copy": "Skopírovať faktúru",
  "settings.donations.invoice.copyFailed": "Faktúru sa nepodarilo skopírovať.",
  "settings.donations.invoice.description":
    "Naskenujte túto Lightning faktúru pre zaplatenie.",
  "settings.donations.invoice.error": "Faktúru pre dar sa nepodarilo vytvoriť.",
  "settings.donations.invoice.missing": "Faktúra pre dar chýba.",
  "settings.donations.invoice.openWallet": "Otvoriť v peňaženke",
  "settings.donations.invoice.title": "Lightning faktúra",
  "settings.donations.invoice.verify.error": "Platbu sa nepodarilo overiť.",
  "settings.donations.invoice.verify.paid": "Platba prijatá",
  "settings.donations.invoice.verify.paid.description":
    "Ďakujeme za podporu vývoja tejto aplikácie.",
  "settings.donations.invoice.verify.waiting": "Čakám na platbu...",
  "settings.donations.metadata.error":
    "Darovaciu Lightning adresu sa nepodarilo načítať.",
  "settings.donations.rate.error": "BTC kurz sa nepodarilo načítať.",
  "settings.donations.sats.description": "Iba celé sats.",
  "settings.donations.sats.label": "Sats",
  "settings.donations.sats.range": "Povolený rozsah: {min}-{max} sats.",
  "settings.donations.title": "Dary",
  "settings.evoluExport.action": "Exportovať",
  "settings.evoluExport.action.pending": "Exportujem...",
  "settings.evoluExport.confirm.description":
    "Export bude uložený bez anonymizácie.",
  "settings.evoluExport.confirm.label":
    "Rozumiem, že export môže obsahovať citlivé dáta.",
  "settings.evoluExport.database.app": "Aplikačná databáza",
  "settings.evoluExport.database.app.description":
    "Business dáta, záznamy platieb, metadata peňaženky, nastavenia účtu a konfigurácia pluginov pre aktívny účet.",
  "settings.evoluExport.database.device": "Databáza zariadenia",
  "settings.evoluExport.database.device.description":
    "Lokálny profil zariadenia, aplikačné účty, recovery phrase a nastavenia synchronizačných transportov uložené na tomto zariadení.",
  "settings.evoluExport.description":
    "Export lokálnych Evolu databáz pre zálohu a podporu",
  "settings.evoluExport.destination.capacitor":
    "Súbory sa uložia do Documents/ na tomto zariadení.",
  "settings.evoluExport.destination.web": "Súbory stiahne tento prehliadač.",
  "settings.evoluExport.format.description":
    "Každá vybraná databáza sa exportuje ako surový SQLite súbor.",
  "settings.evoluExport.format.sqlite": "SQLite",
  "settings.evoluExport.options.description":
    "Vyberte, ktoré lokálne databázy sa majú zahrnúť.",
  "settings.evoluExport.options.format": "Formát",
  "settings.evoluExport.options.scope": "Rozsah exportu",
  "settings.evoluExport.options.title": "Nastavenia exportu",
  "settings.evoluExport.status.createdAt": "Vytvorené {createdAt}",
  "settings.evoluExport.status.error": "Export zlyhal.",
  "settings.evoluExport.status.savedTo": "Uložené do {path}",
  "settings.evoluExport.status.success": "Export dokončený.",
  "settings.evoluExport.status.title": "Stav exportu",
  "settings.evoluExport.title": "Evolu Export",
  "settings.evoluExport.warning.businessData": "business dáta",
  "settings.evoluExport.warning.description":
    "Full export databáz môže obsahovať dáta, ktoré umožňujú prístup k prostriedkom, integráciám alebo súkromnej obchodnej histórii. Exportované súbory ukladajte bezpečne a zdieľajte ich len s dôveryhodnými príjemcami.",
  "settings.evoluExport.warning.localConfiguration":
    "lokálna konfigurácia aplikácie a nastavenia synchronizácie",
  "settings.evoluExport.warning.payments": "účtenky, platby a transakcie",
  "settings.evoluExport.warning.secrets":
    "mnemoniky peňaženiek, recovery phrase a API tokeny",
  "settings.evoluExport.warning.title": "Citlivý export",
  "settings.evoluExport.warning.walletMetadata":
    "metadata súvisiace s peňaženkou",
  "settings.fiat.czk.description": "Používať českú korunu pre sumy v termináli",
  "settings.fiat.czk.title": "Česká koruna",
  "settings.fiat.description": "Vyberte predvolenú fiat menu",
  "settings.fiat.eur.description": "Používať euro pre sumy v termináli",
  "settings.fiat.eur.title": "Euro",
  "settings.fiat.mode.description":
    "Vyberte fiat menu, ktorá sa použije ako predvolená pri vytváraní platieb.",
  "settings.fiat.mode.title": "Predvolená fiat mena",
  "settings.fiat.title": "Fiat mena",
  "settings.fiat.usd.description":
    "Používať americký dolár pre sumy v termináli",
  "settings.fiat.usd.title": "Americký dolar",
  "settings.fiatBankAccount.advanced": "Pokročilé možnosti",
  "settings.fiatBankAccount.currency.description":
    "Platby v tejto mene môžu použiť tento bankový účet.",
  "settings.fiatBankAccount.currency.label": "Mena bankového účtu",
  "settings.fiatBankAccount.enabled.description":
    "Vypnutý účet zostane uložený, ale platobné toky ho budú ignorovať.",
  "settings.fiatBankAccount.enabled.label": "Povoliť fiat bankový účet",
  "settings.fiatBankAccount.form.description":
    "Aplikácia teraz používa jeden deterministický fiat bankový účet.",
  "settings.fiatBankAccount.form.title": "Údaje bankového účtu",
  "settings.fiatBankAccount.iban.description":
    "Zadajte IBAN alebo české číslo účtu, napríklad 123456789/0100. Uložená hodnota sa normalizuje na IBAN.",
  "settings.fiatBankAccount.iban.invalid":
    "Zadajte platný IBAN alebo české číslo účtu.",
  "settings.fiatBankAccount.iban.label": "IBAN alebo číslo účtu",
  "settings.fiatBankAccount.iban.required":
    "Zadajte IBAN alebo číslo účtu, alebo bankový prevod vypnite.",
  "settings.fiatBankAccount.qrFormat.description":
    "Tento formát sa pri bankových QR platbách zobrazí ako prvý.",
  "settings.fiatBankAccount.qrFormat.label": "Predvolený formát QR",
  "settings.fiatBankAccount.qrFormat.payBySquare1_0_0":
    "Pay by square 1.0 (Slovensko)",
  "settings.fiatBankAccount.qrFormat.payBySquare1_2_0":
    "Pay by square 1.2 (Slovensko)",
  "settings.fiatBankAccount.qrFormat.spayd": "SPAYD (Česko)",
  "settings.fioPlugin.active.description":
    "Keď je plugin zapnutý, kontroluje transakcie Fio banky pre fiat bankový účet.",
  "settings.fioPlugin.active.label": "Povoliť Fio plugin",
  "settings.fioPlugin.description":
    "Nastavenie tokenov na synchronizáciu transakcií z Fio banky",
  "settings.fioPlugin.form.description":
    "Plugin teraz používa deterministický fiat bankový účet.",
  "settings.fioPlugin.form.title": "Základné nastavenia",
  "settings.fioPlugin.interval.description":
    "Ako často má plugin kontrolovať nové transakcie.",
  "settings.fioPlugin.interval.invalid": "Zadajte celé číslo väčšie ako nula.",
  "settings.fioPlugin.interval.label": "Sekúnd medzi kontrolami",
  "settings.fioPlugin.lastSyncedDate.description":
    "Lokálna zarážka synchronizácie. Ak ešte neexistuje, použije sa včerajší dátum.",
  "settings.fioPlugin.lastSyncedDate.invalid": "Zadajte platný dátum.",
  "settings.fioPlugin.lastSyncedDate.label": "Posledný synchronizovaný dátum",
  "settings.fioPlugin.nativeRuntimeWarning.description":
    "Táto aplikácia teraz beží v bežnom prehliadači/PWA prostredí, takže automatické kontroly platieb Fio sa tu nespustia.",
  "settings.fioPlugin.nativeRuntimeWarning.title":
    "Fio plugin je dostupný iba v natívnej aplikácii.",
  "settings.fioPlugin.syncLookbackDays.description":
    "Koľko dní pred poslednou lokálnou zarážkou sa má znovu kontrolovať.",
  "settings.fioPlugin.syncLookbackDays.invalid":
    "Zadajte celé číslo väčšie ako nula.",
  "settings.fioPlugin.syncLookbackDays.label": "Dni spätnej kontroly",
  "settings.fioPlugin.title": "Fio plugin",
  "settings.fioPlugin.token.description":
    "Nechajte prázdne, ak chcete uložiť len základné nastavenia.",
  "settings.fioPlugin.token.invalid":
    "Zadajte token dlhý maximálne 255 znakov.",
  "settings.fioPlugin.token.label": "Fio API token",
  "settings.fioPlugin.token.required":
    "Pri vytváraní pluginu je prvý token povinný.",
  "settings.fioPlugin.tokens.active": "Aktívny",
  "settings.fioPlugin.tokens.add.description":
    "Ukladá sa samostatne, takže nastavenia vyššie sa dajú meniť bez prepísania tokenu. Sync job prechádza všetky uložené tokeny.",
  "settings.fioPlugin.tokens.add.saved": "Fio API token pridaný.",
  "settings.fioPlugin.tokens.add.submit": "Pridať token",
  "settings.fioPlugin.tokens.add.title": "Pridať token",
  "settings.fioPlugin.tokens.description":
    "Uložené tokeny sa používajú pri kontrole transakcií účtu.",
  "settings.fioPlugin.tokens.empty": "Nie sú uložené žiadne tokeny.",
  "settings.fioPlugin.tokens.item": "Fio API token",
  "settings.fioPlugin.tokens.remove": "Odobrať",
  "settings.fioPlugin.tokens.title": "Tokeny",
  "settings.items.add": "Pridať položku",
  "settings.items.category.all": "Všetko",
  "settings.items.category.uncategorized": "Bez kategórie",
  "settings.items.delete": "Vymazať položku",
  "settings.items.delete.confirm.cancel": "Zrušiť",
  "settings.items.delete.confirm.confirm": "Vymazať",
  "settings.items.delete.confirm.description":
    "Účty a platby, v ktorých bola položka {name} už použitá, si zachovajú vlastnú kópiu, ale nebude ju možné pridať do nových.",
  "settings.items.delete.confirm.title": "Vymazať položku {name}?",
  "settings.items.description": "Správa predávaných produktov a služieb",
  "settings.items.empty.description":
    "Pridajte produkty alebo služby, ktoré predávate, aby ste ich mohli rýchlo pridávať do účtu.",
  "settings.items.empty.title": "Zatiaľ žiadne položky",
  "settings.items.emptySearch": "Vyhľadávanie nenašlo žiadne položky.",
  "settings.items.form.card.description":
    "Názov, cena a nepovinný popis zobrazený pri pridávaní položky do účtu.",
  "settings.items.form.card.title": "Detaily",
  "settings.items.form.category.label": "Kategória",
  "settings.items.form.category.none": "Bez kategórie",
  "settings.items.form.currency.label": "Mena",
  "settings.items.form.description.invalid":
    "Popis je príliš dlhý (max. 255 znakov).",
  "settings.items.form.description.label": "Popis",
  "settings.items.form.description.placeholder": "Nepovinné",
  "settings.items.form.internalDescription.invalid":
    "Interný popis je príliš dlhý (max. 255 znakov).",
  "settings.items.form.internalDescription.label": "Interný popis",
  "settings.items.form.internalDescription.placeholder":
    "Nepovinné – viditeľné iba pre personál",
  "settings.items.form.internalName.hint":
    "Zobrazí sa personálu namiesto verejného názvu. Zákazníci na účte stále vidia verejný názov a popis.",
  "settings.items.form.internalName.invalid":
    "Interný názov je príliš dlhý (max. 255 znakov).",
  "settings.items.form.internalName.label": "Interný názov",
  "settings.items.form.internalName.placeholder":
    "Nepovinné – zobrazí sa personálu namiesto verejného názvu",
  "settings.items.form.invalidId": "Neplatné ID položky.",
  "settings.items.form.name.invalid": "Zadajte názov.",
  "settings.items.form.name.label": "Názov",
  "settings.items.form.name.placeholder": "napr. Káva",
  "settings.items.form.notFound": "Táto položka už neexistuje.",
  "settings.items.form.price.invalid": "Zadajte platnú cenu.",
  "settings.items.form.price.label": "Cena",
  "settings.items.form.save.create": "Pridať položku",
  "settings.items.form.saved.create": "Položka bola pridaná.",
  "settings.items.form.scanCode.duplicate": "Už je priradený položke {name}.",
  "settings.items.form.scanCode.invalid": "Zadajte platný kód.",
  "settings.items.form.scanCode.label": "Kód na skenovanie",
  "settings.items.form.scanCode.placeholder": "napr. 8594001234567",
  "settings.items.form.scanCode.scan.aria": "Naskenovať kód",
  "settings.items.form.sku.invalid": "SKU je príliš dlhé (max. 255 znakov).",
  "settings.items.form.sku.label": "SKU",
  "settings.items.form.sku.placeholder": "Nepovinné",
  "settings.items.form.taxRate.description":
    "Uplatní sa na účtoch a platbách po použití tejto položky. Sadzby správte v Nastaveniach › Daňové sadzby.",
  "settings.items.form.taxRate.label": "Daňová sadzba",
  "settings.items.form.taxRate.none": "Bez daňovej sadzby",
  "settings.items.form.title.create": "Pridať položku",
  "settings.items.form.title.edit": "Upraviť položku",
  "settings.items.search": "Hľadať položky...",
  "settings.items.search.clear.aria": "Vymazať hľadanie",
  "settings.items.title": "Položky",
  "settings.language.czech.description": "Používať české preklady",
  "settings.language.czech.title": "Čeština",
  "settings.language.description": "Vyberte jazyk aplikácie a región",
  "settings.language.english.description": "Používať anglické preklady",
  "settings.language.english.title": "Angličtina",
  "settings.language.locale.czech.description":
    "Používať české formátovanie dátumov, čísel a mien",
  "settings.language.locale.czech.title": "Česko",
  "settings.language.locale.description":
    "Vyberte regionálny formát pre dátumy, čísla a meny.",
  "settings.language.locale.english.description":
    "Používať americké formátovanie dátumov, čísel a mien",
  "settings.language.locale.english.title": "Spojené štáty",
  "settings.language.locale.slovak.description":
    "Používať slovenské formátovanie dátumov, čísel a mien",
  "settings.language.locale.slovak.title": "Slovensko",
  "settings.language.locale.title": "Regionálny formát",
  "settings.language.mode.description":
    "Vyberte jazyk, ktorý má aplikácia používať.",
  "settings.language.mode.title": "Jazyk aplikácie",
  "settings.language.slovak.description": "Používať slovenské preklady",
  "settings.language.slovak.title": "Slovenčina",
  "settings.language.title": "Jazyk a región",
  "settings.legalEntity.country.label": "Krajina",
  "settings.legalEntity.country.placeholder": "Vyberte krajinu",
  "settings.legalEntity.description":
    "Určuje krajinu pre predvolené daňové sadzby a to, či sa sadzby uplatňujú na položky katalógu.",
  "settings.legalEntity.title": "Krajina a DPH",
  "settings.legalEntity.vatPayer.description":
    "Pridá daňové sadzby k položkám katalógu.",
  "settings.legalEntity.vatPayer.label": "Som platiteľ DPH",
  "settings.paymentAccounts.description":
    "Nastavenie bankového, Spark a pokladničného účtu",
  "settings.paymentAccounts.default": "Predvolená",
  "settings.paymentAccounts.method.cashRegister": "Hotovosť",
  "settings.paymentAccounts.method.iban": "Bankový prevod",
  "settings.paymentAccounts.method.cardSwitchio": "Platobná karta",
  "settings.paymentAccounts.method.spark": "Bitcoin",
  "settings.paymentAccounts.moveDown.aria": "Posunúť {name} nadol",
  "settings.paymentAccounts.moveUp.aria": "Posunúť {name} nahor",
  "settings.paymentAccounts.order.description":
    "Zákazník uvidí platobné metódy v tomto poradí. Prvá dostupná sa otvorí automaticky.",
  "settings.paymentAccounts.status.currencyMismatch":
    "Nastavené v {currency}, aplikácia však používa {appCurrency}",
  "settings.paymentAccounts.status.missingIban":
    "Na zapnutie doplňte bankový účet",
  "settings.paymentAccounts.title": "Platobné účty",
  "settings.paymentNumberSeries.day.default.description":
    "Pridať do generovaných čísel platieb dvojciferný deň",
  "settings.paymentNumberSeries.day.default.title": "Zobraziť deň",
  "settings.paymentNumberSeries.day.hidden.description":
    "Nepridávať deň do generovaných čísel platieb",
  "settings.paymentNumberSeries.day.hidden.title": "Skryť deň",
  "settings.paymentNumberSeries.day.label": "Formát dňa",
  "settings.paymentNumberSeries.description":
    "Nastavenie generovania čísel platieb",
  "settings.paymentNumberSeries.form.description":
    "Tieto hodnoty určujú deterministický číselný rad používaný terminálom.",
  "settings.paymentNumberSeries.form.title": "Formát číselného radu",
  "settings.paymentNumberSeries.lastNumber.date.description":
    "Kotviaci dátum na rozhodnutie, či ďalšia platba pokračuje v rade, alebo ho resetuje. Prázdna hodnota resetuje rad pri ďalšej platbe.",
  "settings.paymentNumberSeries.lastNumber.date.invalid":
    "Zadajte platný dátum.",
  "settings.paymentNumberSeries.lastNumber.date.label": "Kotviaci dátum",
  "settings.paymentNumberSeries.lastNumber.description":
    "Prestavenie posledného použitého poradového čísla. Ďalšie vygenerované číslo platby bude pokračovať od tejto hodnoty.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.description":
    "Posledné použité poradové číslo. Napríklad zadajte 499, ak ďalšia platba má použiť 500.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.invalid":
    "Zadajte nulu alebo kladné celé číslo.",
  "settings.paymentNumberSeries.lastNumber.serialNumber.label":
    "Posledné poradové číslo",
  "settings.paymentNumberSeries.lastNumber.title": "Posledné použité číslo",
  "settings.paymentNumberSeries.month.default.description":
    "Pridať do generovaných čísel platieb dvojciferný mesiac",
  "settings.paymentNumberSeries.month.default.title": "Zobraziť mesiac",
  "settings.paymentNumberSeries.month.hidden.description":
    "Nepridávať mesiac do generovaných čísel platieb",
  "settings.paymentNumberSeries.month.hidden.title": "Skryť mesiac",
  "settings.paymentNumberSeries.month.label": "Formát mesiaca",
  "settings.paymentNumberSeries.prefix.description":
    "Voliteľná predpona pridaná pred generované čísla platieb.",
  "settings.paymentNumberSeries.prefix.invalid":
    "Zadajte predponu dlhú maximálne 255 znakov.",
  "settings.paymentNumberSeries.prefix.label": "Predpona",
  "settings.paymentNumberSeries.serialNumberDigits.description":
    "Minimálny počet číslic pre rastúcu poradovú časť.",
  "settings.paymentNumberSeries.serialNumberDigits.invalid":
    "Zadajte celé číslo väčšie ako nula.",
  "settings.paymentNumberSeries.serialNumberDigits.label":
    "Počet číslic poradia",
  "settings.paymentNumberSeries.title": "Číselný rad platieb",
  "settings.paymentNumberSeries.year.default.description":
    "Pridať do generovaných čísel platieb celý štvorciferný rok",
  "settings.paymentNumberSeries.year.default.title": "Celý rok",
  "settings.paymentNumberSeries.year.label": "Formát roka",
  "settings.paymentNumberSeries.year.short.description":
    "Pridať do generovaných čísel platieb krátky dvojciferný rok",
  "settings.paymentNumberSeries.year.short.title": "Krátky rok",
  "settings.payments": "PLATBY",
  "settings.privacy.description": "Správa hlásenia chýb",
  "settings.privacy.errorReporting.description":
    "Odosielať hlásenia pádov a chýb, aby sa dali ľahšie opraviť. Vo východiskovom stave vypnuté — nič sa neodosiela, kým to nezapnete.",
  "settings.privacy.errorReporting.disable": "Vypnúť",
  "settings.privacy.errorReporting.disabled": "Vypnuté",
  "settings.privacy.errorReporting.enable": "Zapnúť",
  "settings.privacy.errorReporting.enabled": "Zapnuté",
  "settings.privacy.errorReporting.title": "Hlásenie chýb",
  "settings.privacy.title": "Súkromie",
  "settings.privacyGroup": "SÚKROMIE",
  "settings.saveFailed": "Zmenu sa nepodarilo uložiť. Skúste to prosím znova.",
  "settings.security.description": "Správa synchronizácie a obnovy účtu",
  "settings.security.mnemonic.copied": "Recovery phrase skopírovaná.",
  "settings.security.mnemonic.copy": "Kopírovať",
  "settings.security.mnemonic.copyError":
    "Recovery phrase sa nepodarilo skopírovať.",
  "settings.security.mnemonic.description":
    "Zobrazenie recovery phrase pre aktívny lokálny účet.",
  "settings.security.mnemonic.help":
    "Udržiavajte túto frázu v súkromí. Kto ju pozná, môže účet obnoviť.",
  "settings.security.mnemonic.label": "Recovery phrase",
  "settings.security.mnemonic.title": "Obnova účtu",
  "settings.security.mnemonic.warning":
    "Ak túto frázu stratíte, tento účet a jeho dáta už nikdy nepôjde obnoviť – nepodarí sa to ani nám.",
  "settings.security.title": "Bezpečnosť a synchronizácia",
  "settings.security.transports.activate": "Aktivovať",
  "settings.security.transports.active": "Aktívny",
  "settings.security.transports.add": "Pridať transport",
  "settings.security.transports.deactivate": "Deaktivovať",
  "settings.security.transports.description":
    "Nastavenie Evolu WebSocket endpointov pre tento device účet.",
  "settings.security.transports.empty": "Nie sú uložené žiadne transporty.",
  "settings.security.transports.footer":
    "Neaktívne transporty zostanú uložené, ale pri otváraní aplikačných dát sa ignorujú.",
  "settings.security.transports.inactive": "Neaktívny",
  "settings.security.transports.saved": "Transport pridaný.",
  "settings.security.transports.title": "Evolu transporty",
  "settings.security.transports.url.description":
    "Povolené sú len zabezpečené WebSocket URL začínajúce na wss:.",
  "settings.security.transports.url.invalid": "Zadajte platnú wss URL.",
  "settings.security.transports.url.label": "WebSocket URL",
  "settings.security.transports.websocket": "WebSocket",
  "settings.sparkAccount.enabled.description":
    "Vypnutý Spark účet zostane uložený, ale platobné toky ho budú ignorovať.",
  "settings.sparkAccount.enabled.label": "Povoliť Spark účet",
  "settings.sparkAccount.advanced": "Pokročilé možnosti",
  "settings.sparkAccount.form.customDescription":
    "Payky prijíma Spark platby do vašej vlastnej peňaženky.",
  "settings.sparkAccount.form.description":
    "Payky túto Spark peňaženku odvodí z kľúča na obnovu účtu.",
  "settings.sparkAccount.form.title": "Spark účet",
  "settings.sparkAccount.mnemonic.description":
    "Mnemonic uchovávajte v tajnosti. Ktokoľvek s ním má prístup k Spark peňaženke.",
  "settings.sparkAccount.mnemonic.label": "Mnemonic peňaženky",
  "settings.sparkAccount.privacyMode.description":
    "Zapne režim súkromia Spark peňaženky pre Lightning platby.",
  "settings.sparkAccount.privacyMode.label": "Zapnúť privacy mode",
  "settings.sparkAccount.privacyMode.loadError":
    "Nastavenie privacy mode v Sparku sa nepodarilo načítať.",
  "settings.sparkAccount.privacyMode.loading": "Načítavam privacy mode...",
  "settings.sparkAccount.syncPointer.description":
    "Lokálny ukazovateľ synchronizácie pre periodické preskenovanie historie. Ak ukazovateľ ešte neexistuje, použije sa dnešný dátum; preskenovanie sa z neho pozerá len 72 hodín dozadu.",
  "settings.sparkAccount.syncPointer.invalid": "Zadajte platný dátum.",
  "settings.sparkAccount.syncPointer.label": "Posledný synchronizovaný dátum",
  "settings.sparkAccount.wallet.cancel": "Zrušiť",
  "settings.sparkAccount.wallet.change": "Zmeniť peňaženku…",
  "settings.sparkAccount.wallet.changeDialog.current":
    "Túto peňaženku už používate.",
  "settings.sparkAccount.wallet.changeDialog.description":
    "Vyberte peňaženku, do ktorej majú chodiť nové Spark platby.",
  "settings.sparkAccount.wallet.changeDialog.inUse": "Práve sa používa.",
  "settings.sparkAccount.wallet.changeDialog.invalid":
    "Toto nie je platný mnemonic s 12 slovami.",
  "settings.sparkAccount.wallet.changeDialog.title": "Zmeniť peňaženku",
  "settings.sparkAccount.wallet.changeDialog.wordCount": "{value}/12 slov",
  "settings.sparkAccount.wallet.custom.description":
    "Spark peňaženka, ktorú pridáte jej 12-slovným mnemonicom.",
  "settings.sparkAccount.wallet.custom.title": "Vlastná peňaženka",
  "settings.sparkAccount.wallet.label": "Peňaženka",
  "settings.sparkAccount.wallet.payky.description":
    "Odvodená z kľúča na obnovu účtu.",
  "settings.sparkAccount.wallet.payky.title": "Peňaženka Payky",
  "settings.sparkAccount.wallet.switch": "Prepnúť",
  "settings.sparkAccount.wallet.warning.funds":
    "Peniaze zostanú v súčasnej peňaženke a tu už nebudú vidieť. Najprv ich vyberte, alebo si uschovajte jej mnemonic.",
  "settings.sparkAccount.wallet.warning.invoices":
    "Nezaplatené faktúry súčasnej peňaženky sa už nezaznamenajú.",
  "settings.support": "PODPORA A INFORMÁCIE",
  "settings.tables.add": "Pridať stôl",
  "settings.tables.delete": "Vymazať stôl",
  "settings.tables.delete.confirm.cancel": "Zrušiť",
  "settings.tables.delete.confirm.confirm": "Vymazať",
  "settings.tables.delete.confirm.description":
    "Uzavreté účty si stôl {name} ponechajú, ale nebude ho možné priradiť k novým.",
  "settings.tables.delete.confirm.title": "Vymazať stôl {name}?",
  "settings.tables.delete.hasOpenBills":
    "Stôl {name} má otvorený účet. Najprv ho zaplaťte alebo presuňte na iný stôl.",
  "settings.tables.description": "Správa stolov a miest na sedenie",
  "settings.tables.empty.description":
    "Pridajte stoly vo svojej prevádzke, aby ste k nim mohli priraďovať účty.",
  "settings.tables.empty.title": "Zatiaľ žiadne stoly",
  "settings.tables.emptySearch": "Vyhľadávanie nenašlo žiadne stoly.",
  "settings.tables.form.card.description":
    "Názov a počet miest zobrazené pri priraďovaní stola k účtu.",
  "settings.tables.form.card.title": "Detaily",
  "settings.tables.form.code.description":
    "Zatiaľ sa nepoužíva - rezervované pre budúci QR kód, ktorý bude tento stôl identifikovať.",
  "settings.tables.form.code.label": "Kód",
  "settings.tables.form.invalidId": "Neplatné ID stola.",
  "settings.tables.form.name.invalid": "Zadajte názov.",
  "settings.tables.form.name.label": "Názov",
  "settings.tables.form.name.placeholder": "napr. Stôl 5",
  "settings.tables.form.notFound": "Tento stôl už neexistuje.",
  "settings.tables.form.save.create": "Pridať stôl",
  "settings.tables.form.saved.create": "Stôl pridaný.",
  "settings.tables.form.seatCount.invalid": "Zadajte platný počet miest.",
  "settings.tables.form.seatCount.label": "Počet miest",
  "settings.tables.form.seatCount.placeholder": "napr. 4",
  "settings.tables.form.title.create": "Pridať stôl",
  "settings.tables.form.title.edit": "Upraviť stôl",
  "settings.tables.search": "Hľadať stoly...",
  "settings.tables.search.clear.aria": "Vymazať hľadanie",
  "settings.tables.seatCount": "{value} miest",
  "settings.tables.title": "Stoly",
  "settings.taxRates.activate": "Znovu aktivovať {name}",
  "settings.taxRates.activate.confirm.cancel": "Zrušiť",
  "settings.taxRates.activate.confirm.confirm": "Aktivovať",
  "settings.taxRates.activate.confirm.description":
    "{name} bude znovu dostupná pri priraďovaní daňových sadzieb katalógovým položkám.",
  "settings.taxRates.activate.confirm.title": "Znovu aktivovať {name}?",
  "settings.taxRates.add": "Pridať sadzbu",
  "settings.taxRates.add.title": "Pridať daňovú sadzbu",
  "settings.taxRates.archive": "Archivovať {name}",
  "settings.taxRates.archive.confirm.cancel": "Zrušiť",
  "settings.taxRates.archive.confirm.confirm": "Archivovať",
  "settings.taxRates.archive.confirm.description":
    "{name} sa skryje z ponuky pre nové katalógové položky. Existujúce položky ju majú ďalej, kým ju nezmeníte. Neskôr ju možno znovu aktivovať.",
  "settings.taxRates.archive.confirm.title": "Archivovať {name}?",
  "settings.taxRates.archived.title": "Archivované",
  "settings.taxRates.default.set": "Nastaviť {name} ako predvolenú",
  "settings.taxRates.default.unset": "Zrušiť {name} ako predvolenú",
  "settings.taxRates.description":
    "Sadzbu po vytvorení nemožno upraviť ani vymazať — namiesto zmeny percenta ju archivujte a založte novú, ak sa sadzba reálne zmení.",
  "settings.taxRates.empty": "Zatiaľ žiadne daňové sadzby.",
  "settings.taxRates.name.invalid": "Zadajte názov.",
  "settings.taxRates.name.label": "Názov",
  "settings.taxRates.name.placeholder": "napr. Základná sadzba",
  "settings.taxRates.rate.description":
    "Percento, napr. 21 alebo 12,5. Po uložení už nemožno zmeniť.",
  "settings.taxRates.rate.invalid": "Zadajte percento medzi 0 a 100.",
  "settings.taxRates.rate.label": "Sadzba (%)",
  "settings.taxRates.rename": "Premenovať {name}",
  "settings.taxRates.rename.input": "Nový názov pre {name}",
  "settings.taxRates.title": "Daňové sadzby",
  "settings.theme.dark.description": "Vždy použiť tmavé rozhranie",
  "settings.theme.dark.title": "Tmavý",
  "settings.theme.description": "Prepínanie medzi svetlým a tmavým režimom",
  "settings.theme.light.description": "Vždy použiť svetlé rozhranie",
  "settings.theme.light.title": "Svetlý",
  "settings.theme.mode.description":
    "Vyberte pevný motív alebo nastavenie podľa zariadenia.",
  "settings.theme.mode.title": "Režim vzhľadu",
  "settings.theme.system.description":
    "Riadiť sa nastavením operačného systému",
  "settings.theme.system.title": "Auto",
  "settings.theme.title": "Motív",
  "settings.tips.description": "Nastavenie tringeltu pre účty",
  "settings.tips.enabled.description":
    "Zákazníci môžu pri platení pridať tringelt.",
  "settings.tips.enabled.label": "Povoliť tringelty",
  "settings.tips.fixedAmounts.add": "Pridať pevnú sumu",
  "settings.tips.fixedAmounts.description":
    "Zákazníci môžu pri platení vybrať tieto sumy v {currency}.",
  "settings.tips.fixedAmounts.duplicate": "Táto pevná suma už je v zozname.",
  "settings.tips.fixedAmounts.invalid":
    "Zadajte kladnú sumu najviac s dvoma desatinnými miestami.",
  "settings.tips.fixedAmounts.label": "Predvolené pevné sumy",
  "settings.tips.fixedAmounts.maximum":
    "Môžete pridať najviac štyri predvolené pevné sumy.",
  "settings.tips.fixedAmounts.placeholder": "napr. 20,00",
  "settings.tips.form.description":
    "Nastavte rýchle voľby tringeltu zobrazované pri platení.",
  "settings.tips.form.title": "Možnosti tringeltu",
  "settings.tips.percentages.add": "Pridať percento",
  "settings.tips.percentages.description":
    "Zákazníci môžu pri platení vybrať tieto percentá.",
  "settings.tips.percentages.duplicate": "Toto percento už je v zozname.",
  "settings.tips.percentages.invalid": "Zadajte celé percento od 1 do 100.",
  "settings.tips.percentages.label": "Predvolené percentuálne hodnoty",
  "settings.tips.percentages.maximum":
    "Môžete pridať najviac štyri predvolené percentuálne hodnoty.",
  "settings.tips.percentages.placeholder": "napr. 15",
  "settings.tips.percentages.value": "{value} %",
  "settings.tips.preset.remove": "Odstrániť {value}",
  "settings.tips.reset": "Obnoviť predvolené hodnoty",
  "settings.tips.save": "Uložiť tringelty",
  "settings.tips.saved": "Nastavenie tringeltu uložené.",
  "settings.tips.title": "Tringelty",
  "settings.title": "Nastavenia",
  "settings.withdrawals.description":
    "Odoslať Bitcoin zo Spark účtu na on-chain adresu",
  "settings.withdrawals.title": "Výbery",
} satisfies Record<keyof typeof enSettings, string>
