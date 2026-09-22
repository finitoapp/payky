import type { enOnboarding } from "@/i18n/en/onboarding.ts"

export const skOnboarding = {
  "accountRestore.description":
    "Čakáme na synchronizáciu údajov účtu. Zvyčajne to trvá pár sekúnd.",
  "accountRestore.timeout.continue": "Čakať ďalej",
  "accountRestore.timeout.description":
    "Nastavenia účtu zatiaľ nedorazili. Môžete ďalej čakať alebo tento účet výslovne nastaviť ako nový.",
  "accountRestore.timeout.setup": "Nastaviť ako nový účet",
  "accountRestore.timeout.title": "Obnova účtu stále prebieha",
  "accountRestore.title": "Obnovovanie účtu",
  "onboarding.account.description":
    "Skontrolujte identitu, ktorú Payky pre toto zariadenie vygeneroval. Môžete ju premenovať a zapnúť synchronizáciu teraz, alebo neskôr v Nastaveniach.",
  "onboarding.account.mnemonic.confirm":
    "Uložil(a) som si recovery phrase na bezpečné miesto",
  "onboarding.account.name.description":
    "Zobrazuje sa v zozname účtov pri prepínaní identít.",
  "onboarding.account.name.error.required": "Zadajte názov účtu.",
  "onboarding.account.name.label": "Názov účtu",
  "onboarding.account.title": "Váš účet",
  "onboarding.account.transport.description":
    "Zapnutím synchronizácie tento účet zálohujete a môžete ho použiť na ďalších zariadeniach.",
  "onboarding.account.transport.title": "Synchronizácia",
  "onboarding.accountChoice.description":
    "Vytvorte nový účet pre toto zariadenie alebo obnovte účet, ktorý už používate.",
  "onboarding.accountChoice.new.description":
    "Vygenerujte novú recovery phrase a začnite s prázdnym účtom.",
  "onboarding.accountChoice.new.title": "Vytvoriť nový účet",
  "onboarding.accountChoice.restore.description":
    "Pomocou recovery phrase otvorte dáta svojho existujúceho účtu.",
  "onboarding.accountChoice.restore.title": "Obnoviť existujúci účet",
  "onboarding.accountChoice.title": "Výber účtu",
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
  "onboarding.language.title": "Výber jazyka",
  "onboarding.next": "Ďalej",
  "onboarding.payments.btc.description":
    "Prijímajte bitcoinové platby cez Spark Lightning účet.",
  "onboarding.payments.btc.title": "Bitcoin",
  "onboarding.payments.cash.description":
    "Evidujte hotovostné platby priamo v termináli.",
  "onboarding.payments.cash.title": "Hotovosť",
  "onboarding.payments.description":
    "Vyberte platobné metódy, ktoré má terminál prijímať.",
  "onboarding.payments.iban.description":
    "Zobrazujte QR kódy pre bankové prevody.",
  "onboarding.payments.iban.title": "Bankový prevod",
  "onboarding.payments.title": "Platobné metódy",
  "onboarding.progress": "Krok",
  "onboarding.restore.action": "Obnoviť účet",
  "onboarding.restore.description":
    "Zadajte SLIP-39 recovery phrase účtu, ktorý chcete obnoviť.",
  "onboarding.restore.title": "Obnovenie existujúceho účtu",
  "onboarding.title": "Nastavenie Payky",
  "recovery.accounts.description":
    "Prepnutím sa aplikácia restartuje na danom účte.",
  "recovery.description":
    "Táto stránka funguje aj vtedy, keď sa aplikácia nedokáže spustiť. Číta len databázu tohto zariadenia, nikdy údaje účtu.",
  "recovery.export.description":
    "Kópia účtov a nastavení zariadenia uložených na tomto zariadení — nie účtenky alebo platby niektorého účtu.",
  "recovery.switch.error": "Účet sa nepodarilo prepnúť.",
  "recovery.title": "Obnovenie prístupu",
} satisfies Record<keyof typeof enOnboarding, string>
