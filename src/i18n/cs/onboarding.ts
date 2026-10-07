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
  "onboarding.account.description":
    "Uložte si frázi níže na bezpečné místo. Budete ji potřebovat, až budete chtít účet otevřít na jiném zařízení.",
  "onboarding.account.mnemonic.confirm":
    "Uložil(a) jsem si recovery phrase na bezpečné místo",
  "onboarding.account.mnemonic.required":
    "Než nastavení dokončíte, potvrďte, že máte recovery phrase uloženou.",
  "onboarding.account.title": "Zálohování účtu",
  "onboarding.accountChoice.description":
    "Vytvořte nový účet pro toto zařízení nebo obnovte účet, který už používáte.",
  "onboarding.accountChoice.new.description":
    "Vygenerujte novou recovery phrase a začněte s prázdným účtem.",
  "onboarding.accountChoice.new.title": "Založit nový účet",
  "onboarding.accountChoice.restore.description":
    "Pomocí recovery phrase otevřete data svého existujícího účtu.",
  "onboarding.accountChoice.restore.title": "Obnovit existující účet",
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
  "posLogin.cancel": "Zrušit",
  "posLogin.confirm": "Otevřít pokladnu",
  "posLogin.description":
    "Z tohoto zařízení se stane pokladna podniku, který vám poslal odkaz. Bude přijímat platby pro majitele a každý prodej mu předá.",
  "posLogin.invalid.description":
    "Odkaz je možná zkrácený. Požádejte majitele, ať ho pošle znovu, a otevřete ho celý.",
  "posLogin.invalid.home": "Přejít do aplikace",
  "posLogin.invalid.title": "Tento odkaz na pokladnu nefunguje",
  "posLogin.otherAccounts":
    "V zařízení jsou i jiné účty. Kdokoli u této pokladny může režim pokladny opustit a otevřít je.",
  "posLogin.title": "Otevřít pokladnu",
  "recovery.accounts.description":
    "Přepnutím se aplikace restartuje na daném účtu.",
  "recovery.description":
    "Tato stránka funguje i tehdy, když se aplikace nedokáže spustit. Čte jen databázi tohoto zařízení, nikdy data účtu.",
  "recovery.export.description":
    "Kopie účtů a nastavení zařízení uložených na tomto zařízení — ne účtenky nebo platby některého účtu.",
  "recovery.switch.error": "Účet se nepodařilo přepnout.",
  "recovery.title": "Obnovení přístupu",
} satisfies Record<keyof typeof enOnboarding, string>
