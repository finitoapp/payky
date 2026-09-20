import type { enOnboarding } from "@/i18n/en/onboarding.ts"

export const skOnboarding = {
  "accountRestore.description":
    "Čakáme na synchronizáciu údajov účtu. Zvyčajne to trvá pár sekúnd.",
  "accountRestore.timeout.continue": "Čakať ďalej",
  "accountRestore.timeout.description":
    "Nastavenia účtu zatiaľ nedorazili. Fráza môže patriť účtu, ktorý v Payky ešte nebol použitý – napríklad založenému v Linky. Čakajte ďalej, alebo tento účet nastavte hneď; jeho recovery phrase zostane tá, ktorú ste zadali.",
  "accountRestore.timeout.setup": "Nastaviť tento účet",
  "accountRestore.timeout.title": "Obnova účtu stále prebieha",
  "accountRestore.title": "Obnovovanie účtu",
  "onboarding.back": "Späť",
  "onboarding.cancelSetup": "Zrušiť vytváranie účtu",
  "onboarding.cancelSetup.confirm.cancel": "Pokračovať v nastavení",
  "onboarding.cancelSetup.confirm.confirm": "Zrušiť vytváranie účtu",
  "onboarding.cancelSetup.confirm.description":
    "Tento nový účet bude zahodený a prepnete sa späť na {name}.",
  "onboarding.cancelSetup.confirm.title": "Zrušiť vytváranie účtu?",
  "onboarding.country.description":
    "Podľa toho nastavíme predvolené daňové sadzby v katalógu.",
  "onboarding.country.title": "Vyberte svoju krajinu",
  "onboarding.country.vatPayer.description":
    "Zapne daňové sadzby pre položky katalógu. Neskôr to môžete zmeniť v Nastaveniach.",
  "onboarding.country.vatPayer.label": "Som platiteľ DPH",
  "onboarding.finish": "Dokončiť",
  "onboarding.payments.bankAccount.bankDetected": "Účet v banke {bank}.",
  "onboarding.payments.bankAccount.bankUnknown":
    "Kód banky zatiaľ v zozname nemáme; účet je aj tak platný.",
  "onboarding.payments.bankAccount.description":
    "České alebo slovenské číslo účtu (napr. 19-2000145399/0800) alebo IBAN.",
  "onboarding.payments.bankAccount.label": "Bankový účet pre prevody",
  "onboarding.payments.bankAccount.placeholder":
    "123456789/0800 alebo SK31 1200 …",
  "onboarding.payments.skipHint":
    "Nemáte účet poruke? Nechajte pole prázdne a doplňte ho neskôr v Nastaveniach. Bitcoinové platby cez cashu sú zapnuté od začiatku.",
  "onboarding.payments.description":
    "Kam majú chodiť bankové prevody. Neskôr to môžete zmeniť.",
  "onboarding.payments.title": "Bankový účet",
  "onboarding.restore.action": "Obnoviť účet",
  "onboarding.restore.description":
    "Zadajte SLIP-39 recovery phrase účtu, ktorý chcete obnoviť.",
  "onboarding.restore.title": "Obnovenie existujúceho účtu",
  "onboarding.start.create": "Vytvoriť nový účet",
  "onboarding.start.createHint": "Nepotrebuješ telefón ani e-mail.",
  "onboarding.start.restore": "Už mám účet",
  "onboarding.start.restoreHint":
    "Prihlásiš sa svojimi 20 slovami – z Payky alebo z Linky.",
  "onboarding.start.subtitle":
    "Platobný terminál pre bitcoin a bankové prevody.",
  "onboarding.title": "Payky",
  "recovery.accounts.description":
    "Prepnutím sa aplikácia restartuje na danom účte.",
  "recovery.description":
    "Táto stránka funguje aj vtedy, keď sa aplikácia nedokáže spustiť. Číta len databázu tohto zariadenia, nikdy údaje účtu.",
  "recovery.export.description":
    "Kópia účtov a nastavení zariadenia uložených na tomto zariadení — nie účtenky alebo platby niektorého účtu.",
  "recovery.switch.error": "Účet sa nepodarilo prepnúť.",
  "recovery.title": "Obnovenie prístupu",
} satisfies Record<keyof typeof enOnboarding, string>
