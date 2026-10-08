import type { enOnboarding } from "@/i18n/en/onboarding.ts"

export const csOnboarding = {
  "accountRestore.action.addRelay": "Přidat synchronizační server",
  "accountRestore.action.otherPhrase": "Použít jinou obnovovací frázi",
  "accountRestore.action.retry": "Zkusit znovu",
  "accountRestore.action.setupNew": "Nastavit tento účet jako nový",
  "accountRestore.description":
    "Čekáme na synchronizaci dat účtu. Obvykle to trvá pár sekund.",
  "accountRestore.empty.description":
    "Všechny synchronizační servery dokončily synchronizaci, ale žádný z nich nemá data pro tuto obnovovací frázi. Data mohou být na serveru, který v seznamu není, nebo fráze patří k jinému účtu.",
  "accountRestore.empty.title": "Data účtu nenalezena",
  "accountRestore.failed.description":
    "S některými synchronizačními servery se nepodařilo synchronizovat, takže data účtu mohou existovat, jen zatím nedorazila. Zkontrolujte seznam a zkuste to znovu.",
  "accountRestore.failed.offline":
    "Zařízení je offline. Připojte se k internetu a zkuste to znovu.",
  "accountRestore.failed.title": "Účet se nepodařilo synchronizovat",
  "accountRestore.relays.title": "Synchronizační servery",
  "accountRestore.setupNew.confirm.cancel": "Zpět",
  "accountRestore.setupNew.confirm.confirm": "Nastavit jako nový",
  "accountRestore.setupNew.confirm.description":
    "Nedostupné synchronizační servery mohou data tohoto účtu stále mít. Pokud se později synchronizují, nastavení, které zvolíte teď, je přepíše.",
  "accountRestore.setupNew.confirm.title": "Nastavit bez dat účtu?",
  "accountRestore.syncing": "Synchronizace dat účtu…",
  "accountRestore.title": "Obnovování účtu",
  "accountTransfer.cancel": "Zrušit",
  "accountTransfer.close": "Zavřít",
  "accountTransfer.done": "Hotovo",
  "accountTransfer.settings.source.description":
    "Otevřete tento účet na telefonu nebo jiném počítači bez opisování obnovovací fráze.",
  "accountTransfer.settings.source.title": "Přihlásit účet na jiném zařízení",
  "accountTransfer.source.code.confirm": "Potvrdit a přenést",
  "accountTransfer.source.code.connected": "Připojilo se zařízení.",
  "accountTransfer.source.code.instructions":
    "Opište šestimístný kód, který teď vidíte na novém zařízení.",
  "accountTransfer.source.code.label": "Kód z nového zařízení",
  "accountTransfer.source.code.mismatch":
    "Kód nesouhlasí. Zkontrolujte ho a zkuste to znovu. Zbývající pokusy: {count}.",
  "accountTransfer.source.code.warning":
    "Opisujte ho jen z displeje zařízení, které držíte v ruce. Pokud vám kód někdo diktuje, přenos zrušte.",
  "accountTransfer.source.done.acked":
    "Nové zařízení účet přijalo. Dokončete přenos na novém zařízení. Na tomto zařízení se nic nemění.",
  "accountTransfer.source.done.sent":
    "Odesláno. Dokončete přenos na novém zařízení.",
  "accountTransfer.source.done.title": "Účet odeslán",
  "accountTransfer.source.failed.cancelled":
    "Přenos byl zrušen na novém zařízení.",
  "accountTransfer.source.failed.codeMismatch": "Kód třikrát nesouhlasil.",
  "accountTransfer.source.failed.conflict":
    "Na kód odpovědělo víc zařízení, a proto byl přenos z bezpečnostních důvodů zastaven. Pokud to druhé nebylo vaše, mohl někdo vidět vaši obrazovku.",
  "accountTransfer.source.failed.network":
    "Nepodařilo se spojit s přenosovým serverem. Zkontrolujte připojení k internetu.",
  "accountTransfer.source.failed.nothingSent": "Nic nebylo odesláno.",
  "accountTransfer.source.failed.timeout":
    "Nové zařízení nestihlo přenos dokončit.",
  "accountTransfer.source.failed.title": "Přenos zastaven",
  "accountTransfer.source.qr.expired": "Platnost kódu vypršela.",
  "accountTransfer.source.qr.instructions":
    "Na novém zařízení otevřete Payky, zvolte „Přenést z jiného zařízení“ a naskenujte tento kód.",
  "accountTransfer.source.qr.label": "QR kód pro nové zařízení",
  "accountTransfer.source.qr.reassurance":
    "Kód platí dvě minuty a jen pro jedno zařízení.",
  "accountTransfer.source.qr.renew": "Vytvořit nový kód",
  "accountTransfer.source.qr.validFor": "Platí ještě {time}",
  "accountTransfer.source.qr.waiting": "Čekám na nové zařízení…",
  "accountTransfer.source.sending": "Odesílám účet…",
  "accountTransfer.source.start": "Zobrazit QR kód",
  "accountTransfer.source.startAgain": "Začít znovu",
  "accountTransfer.source.step.code": "Kód z nového zařízení opíšete sem.",
  "accountTransfer.source.step.scan": "Novým zařízením naskenujete QR kód.",
  "accountTransfer.source.step.transfer": "Účet se šifrovaně přenese.",
  "accountTransfer.source.title": "Přihlásit účet na jiném zařízení",
  "accountTransfer.source.warning.description":
    "Nové zařízení získá plný přístup k účtu včetně peněz v bitcoinové peněžence. Pokračujte jen se zařízením, které máte u sebe. Podpora Payky vás o to nikdy nežádá.",
  "accountTransfer.source.warning.title": "Plný přístup k účtu",
  "accountTransfer.target.added":
    "Účet „{name}“ byl přidán do tohoto zařízení a je nyní aktivní. Načítám data…",
  "accountTransfer.target.alreadyAdded":
    "Tento účet už na zařízení byl; nyní je aktivní.",
  "accountTransfer.target.code.instructions":
    "Opište tento kód na původním zařízení.",
  "accountTransfer.target.code.waiting": "Čekám na potvrzení…",
  "accountTransfer.target.code.warning":
    "Kód potvrzuje, že se účet přenáší právě do tohoto zařízení. Nikomu ho nesdělujte.",
  "accountTransfer.target.confirm.cancel": "Zrušit",
  "accountTransfer.target.confirm.confirm": "Přidat a přepnout",
  "accountTransfer.target.confirm.description":
    "Přidat účet „{name}“ do tohoto zařízení a přepnout na něj? Přijaté platby pak půjdou na tento účet.",
  "accountTransfer.target.confirm.title": "Přidat účet „{name}“?",
  "accountTransfer.target.connecting": "Připojuji se k původnímu zařízení…",
  "accountTransfer.target.description":
    "Naskenujte QR kód na zařízení, kde už Payky používáte.",
  "accountTransfer.target.error.InvalidPaykyUri":
    "Kód je poškozený. Vytvořte nový.",
  "accountTransfer.target.error.NotPaykyUri": "Tohle není kód Payky.",
  "accountTransfer.target.error.UnknownPaykyUriType":
    "Tento kód Payky slouží k něčemu jinému, nebo je z novější verze. Aktualizujte aplikaci.",
  "accountTransfer.target.error.UnsupportedPaykyUriVersion":
    "Kód vytvořila novější verze Payky. Aktualizujte aplikaci.",
  "accountTransfer.target.error.WrongPaykyUriType":
    "Tento kód Payky slouží k něčemu jinému.",
  "accountTransfer.target.failed.cancelled":
    "Přenos byl zrušen na původním zařízení.",
  "accountTransfer.target.failed.codeMismatch":
    "Kód byl na původním zařízení třikrát opsán špatně.",
  "accountTransfer.target.failed.conflict":
    "Na kód odpovědělo víc zařízení, a proto byl přenos z bezpečnostních důvodů zastaven.",
  "accountTransfer.target.failed.invalid":
    "Původní zařízení poslalo data, která tu nelze použít. Nic nebylo přidáno.",
  "accountTransfer.target.failed.network":
    "Nepodařilo se spojit s přenosovým serverem. Zkontrolujte připojení k internetu.",
  "accountTransfer.target.failed.timeout":
    "Původní zařízení nestihlo přenos dokončit.",
  "accountTransfer.target.failed.title": "Přenos zastaven",
  "accountTransfer.target.fallback":
    "Nejde to naskenovat? Obnovte účet obnovovací frází.",
  "accountTransfer.target.instructions":
    "Na zařízení, kde účet máte, otevřete Nastavení → Účty → Přihlásit účet na jiném zařízení a naskenujte zobrazený QR kód.",
  "accountTransfer.target.scanAgain": "Skenovat znovu",
  "accountTransfer.target.title": "Přenést z jiného zařízení",
  "accountTransfer.target.warning.description":
    "Skenujte jen kód z vlastního zařízení, které máte právě před sebou. Kód od někoho jiného by sem přidal jeho účet a přijaté platby by šly jemu.",
  "accountTransfer.target.warning.title": "Jen vlastní zařízení",
  "onboarding.account.description":
    "Uložte si frázi níže na bezpečné místo. Budete ji potřebovat, až budete chtít účet otevřít na jiném zařízení.",
  "onboarding.account.mnemonic.confirm":
    "Uložil(a) jsem si recovery phrase na bezpečné místo",
  "onboarding.account.mnemonic.required":
    "Než nastavení dokončíte, potvrďte, že máte recovery phrase uloženou.",
  "onboarding.account.title": "Zálohování účtu",
  "onboarding.accountChoice.description":
    "Vytvořte nový účet pro toto zařízení nebo obnovte účet, který už používáte.",
  "accountChoice.new.description":
    "Vygenerujte novou recovery phrase a začněte s prázdným účtem.",
  "accountChoice.new.title": "Založit nový účet",
  "accountChoice.restore.description":
    "Pomocí recovery phrase otevřete data svého existujícího účtu.",
  "accountChoice.restore.title": "Obnovit existující účet",
  "accountChoice.transfer.description":
    "Naskenujte QR kód na zařízení, kde už Payky používáte.",
  "accountChoice.transfer.title": "Přenést z jiného zařízení",
  "onboarding.accountChoice.title": "Výběr účtu",
  "onboarding.back": "Zpět",
  "onboarding.cancelSetup": "Zrušit vytváření účtu",
  "onboarding.cancelSetup.confirm.cancel": "Pokračovat v nastavení",
  "onboarding.cancelSetup.confirm.confirm": "Zrušit vytváření účtu",
  "onboarding.cancelSetup.confirm.description":
    "Tento nový účet bude zahozen a přepnete se zpět na {name}.",
  "onboarding.cancelSetup.confirm.title": "Zrušit vytváření účtu?",
  "onboarding.countryCurrency.country.description":
    "Určuje daňové sazby, se kterými katalog začne.",
  "onboarding.countryCurrency.currency.description":
    "Všechny částky zadané v terminálu budou v této měně.",
  "onboarding.countryCurrency.currency.label": "Měna",
  "onboarding.countryCurrency.description":
    "Obojí jen přednastaví, jak bude Payky fungovat — změnit to jde kdykoli v Nastavení.",
  "onboarding.countryCurrency.title": "Země a měna",
  "onboarding.finish": "Dokončit",
  "onboarding.language.title": "Výběr jazyka",
  "onboarding.next": "Další",
  "onboarding.payments.btc.description":
    "Přijímejte bitcoinové platby přes Spark Lightning účet.",
  "onboarding.payments.btc.title": "Bitcoin",
  "onboarding.payments.cash.description":
    "Evidujte hotovostní platby přímo v terminálu.",
  "onboarding.payments.cash.title": "Hotovost",
  "onboarding.payments.description":
    "Vyberte platební metody, které má terminál přijímat.",
  "onboarding.payments.iban.description":
    "Zobrazujte QR kódy pro bankovní převody.",
  "onboarding.payments.iban.title": "Bankovní převod",
  "onboarding.payments.title": "Platební metody",
  "onboarding.progress": "Krok",
  "onboarding.restore.action": "Obnovit účet",
  "onboarding.restore.description":
    "Zadejte SLIP-39 recovery phrase účtu, který chcete obnovit.",
  "onboarding.restore.title": "Obnovení existujícího účtu",
  "onboarding.title": "Nastavení Payky",
  "recovery.accounts.description":
    "Přepnutím se aplikace restartuje na daném účtu.",
  "recovery.description":
    "Tato stránka funguje i tehdy, když se aplikace nedokáže spustit. Čte jen databázi tohoto zařízení, nikdy data účtu.",
  "recovery.export.description":
    "Kopie účtů a nastavení zařízení uložených na tomto zařízení — ne účtenky nebo platby některého účtu.",
  "recovery.switch.error": "Účet se nepodařilo přepnout.",
  "recovery.title": "Obnovení přístupu",
} satisfies Record<keyof typeof enOnboarding, string>
