import type { enWithdraw } from "@/i18n/en/withdraw.ts"

export const skWithdraw = {
  "withdraw.address.invalid": "Zadajte platnú bitcoinovú adresu.",
  "withdraw.address.label": "Cieľová adresa",
  "withdraw.address.paste": "Vložiť",
  "withdraw.address.pasteError": "Nepodarilo sa prečítať schránku.",
  "withdraw.address.placeholder": "Zadajte alebo vložte bitcoinovú adresu",
  "withdraw.address.scan": "Naskenovať",
  "withdraw.all.description": "Odoslať celý dostupný zostatok.",
  "withdraw.all.label": "Vybrať všetko",
  "withdraw.amount.available": "Dostupné: {amount} satov",
  "withdraw.amount.invalid": "Zadajte sumu väčšiu ako 0.",
  "withdraw.amount.label": "Suma",
  "withdraw.amount.placeholder": "Suma v satoch",
  "withdraw.continue": "Pokračovať",
  "withdraw.error.accountNotFound": "Spark účet nebol nájdený.",
  "withdraw.error.insufficientBalance":
    "Táto suma presahuje váš dostupný zostatok.",
  "withdraw.form.description":
    "Odošlite Bitcoin zo svojej Spark peňaženky na on-chain adresu.",
  "withdraw.form.title": "Výber na adresu",
  "withdraw.noAccount.action": "Prejsť na platobné účty",
  "withdraw.noAccount.description":
    "Pred výberom nastavte Spark peňaženku v sekcii Platobné účty.",
  "withdraw.noAccount.title": "Nie je nastavený žiadny Spark účet",
  "withdraw.quoteError.generic":
    "Nepodarilo sa získať odhad poplatku. Skúste to znova.",
  "withdraw.quotePending": "Zisťujem odhad poplatku...",
  "withdraw.result.copied": "ID transakcie skopírované",
  "withdraw.result.copyError": "Nepodarilo sa skopírovať ID transakcie.",
  "withdraw.result.copyTxid": "Kopírovať",
  "withdraw.result.description": "Váš výber bol odoslaný do siete.",
  "withdraw.result.done": "Hotovo",
  "withdraw.result.status": "Stav",
  "withdraw.result.title": "Výber odoslaný",
  "withdraw.result.txid": "ID transakcie",
  "withdraw.result.viewOnExplorer": "Zobraziť na mempool.space",
  "withdraw.review.amount": "Suma výberu",
  "withdraw.review.back": "Späť",
  "withdraw.review.confirm": "Potvrdiť výber",
  "withdraw.review.confirming": "Odosielam...",
  "withdraw.review.destination": "Cieľ",
  "withdraw.review.error.interrupted":
    "Výber bol prerušený pred dokončením. Skúste to znova.",
  "withdraw.review.error.recordFailed":
    "Peňaženka výber odoslala, ale Payky nedokázal uložiť záznam transakcie. Pred ďalším pokusom skontrolujte históriu.",
  "withdraw.review.error.sparkFailed":
    "Spark odmietol požiadavku na výber. Skontrolujte zostatok peňaženky a cieľovú adresu a skúste to znova.",
  "withdraw.review.fee": "Odhadovaný sieťový poplatok",
  "withdraw.review.speed.fast": "Rýchly",
  "withdraw.review.speed.medium": "Stredný",
  "withdraw.review.speed.slow": "Pomalý",
  "withdraw.review.title": "Kontrola výberu",
  "withdraw.review.total": "Celková odpočítaná suma",
  "withdraw.review.warning":
    "Bitcoinové transakcie nemožno vrátiť späť. Pred potvrdením skontrolujte adresu.",
  "withdraw.sats": "{amount} satov",
  "withdraw.scan.close": "Zavrieť",
  "withdraw.scan.error":
    "Nepodarilo sa získať prístup ku kamere. Zadajte adresu ručne.",
  "withdraw.scan.title": "Naskenovať adresu",
} satisfies Record<keyof typeof enWithdraw, string>
