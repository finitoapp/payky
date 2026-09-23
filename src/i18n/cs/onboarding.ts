import type { enOnboarding } from "@/i18n/en/onboarding.ts"

export const csOnboarding = {
  "accountRestore.description":
    "Čekáme na synchronizaci dat účtu. Obvykle to trvá pár sekund.",
  "accountRestore.timeout.continue": "Čekat dál",
  "accountRestore.timeout.description":
    "Nastavení účtu zatím nedorazilo. Můžete dále čekat nebo tento účet výslovně nastavit jako nový.",
  "accountRestore.timeout.setup": "Nastavit jako nový účet",
  "accountRestore.timeout.title": "Obnova účtu stále probíhá",
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
  "onboarding.countryCurrency.vatPayer.description":
    "Přidá daňové sazby k položkám katalogu.",
  "onboarding.countryCurrency.vatPayer.label": "Jsem plátce DPH",
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
