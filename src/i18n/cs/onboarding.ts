import type { enOnboarding } from "@/i18n/en/onboarding.ts"

export const csOnboarding = {
  "accountRestore.description":
    "Čekáme na synchronizaci dat účtu. Obvykle to trvá pár sekund.",
  "accountRestore.timeout.continue": "Čekat dál",
  "accountRestore.timeout.description":
    "Nastavení účtu zatím nedorazilo. Fráze může patřit účtu, který v Payky ještě nebyl použit. Čekejte dál, nebo tento účet nastavte hned; jeho recovery phrase zůstane ta, kterou jste zadali.",
  "accountRestore.timeout.setup": "Nastavit tento účet",
  "accountRestore.timeout.title": "Obnova účtu stále probíhá",
  "accountRestore.title": "Obnovování účtu",
  "onboarding.back": "Zpět",
  "onboarding.cancelSetup": "Zrušit vytváření účtu",
  "onboarding.cancelSetup.confirm.cancel": "Pokračovat v nastavení",
  "onboarding.cancelSetup.confirm.confirm": "Zrušit vytváření účtu",
  "onboarding.cancelSetup.confirm.description":
    "Tento nový účet bude zahozen a přepnete se zpět na {name}.",
  "onboarding.cancelSetup.confirm.title": "Zrušit vytváření účtu?",
  "onboarding.country.description":
    "Podle toho nastavíme výchozí daňové sazby v katalogu.",
  "onboarding.country.title": "Vyberte svou zemi",
  "onboarding.country.vatPayer.description":
    "Zapne daňové sazby u položek katalogu. Později to lze změnit v Nastavení.",
  "onboarding.country.vatPayer.label": "Jsem plátce DPH",
  "onboarding.finish": "Dokončit",
  "onboarding.payments.bankAccount.bankDetected": "Účet u banky {bank}.",
  "onboarding.payments.bankAccount.bankUnknown":
    "Kód banky zatím v seznamu nemáme; účet je přesto platný.",
  "onboarding.payments.bankAccount.description":
    "České nebo slovenské číslo účtu (např. 19-2000145399/0800) nebo IBAN.",
  "onboarding.payments.bankAccount.label": "Bankovní účet pro převody",
  "onboarding.payments.bankAccount.placeholder":
    "123456789/0800 nebo CZ65 0800 …",
  "onboarding.payments.skipHint":
    "Nemáte účet po ruce? Nechte pole prázdné a doplňte ho později v Nastavení. Bitcoinové platby přes cashu jsou zapnuté od začátku.",
  "onboarding.payments.description":
    "Kam mají chodit bankovní převody. Později to lze změnit.",
  "onboarding.payments.title": "Bankovní účet",
  "onboarding.restore.action": "Obnovit účet",
  "onboarding.restore.description":
    "Zadejte SLIP-39 recovery phrase účtu, který chcete obnovit.",
  "onboarding.restore.title": "Obnovení existujícího účtu",
  "onboarding.start.create": "Vytvořit nový účet",
  "onboarding.start.createHint": "Nepotřebuješ telefon ani e-mail.",
  "onboarding.start.restore": "Už mám účet",
  "onboarding.start.restoreHint": "Přihlásíš se svými 20 slovy.",
  "onboarding.start.subtitle":
    "Platební terminál pro bitcoin a bankovní převody.",
  "onboarding.title": "Payky",
  "recovery.accounts.description":
    "Přepnutím se aplikace restartuje na daném účtu.",
  "recovery.description":
    "Tato stránka funguje i tehdy, když se aplikace nedokáže spustit. Čte jen databázi tohoto zařízení, nikdy data účtu.",
  "recovery.export.description":
    "Kopie účtů a nastavení zařízení uložených na tomto zařízení — ne účtenky nebo platby některého účtu.",
  "recovery.switch.error": "Účet se nepodařilo přepnout.",
  "recovery.title": "Obnovení přístupu",
} satisfies Record<keyof typeof enOnboarding, string>
