import type { enWithdraw } from "@/i18n/en/withdraw.ts"

export const csWithdraw = {
  "withdraw.address.invalid": "Zadejte platnou bitcoinovou adresu.",
  "withdraw.address.label": "Cílová adresa",
  "withdraw.address.paste": "Vložit",
  "withdraw.address.pasteError": "Nepodařilo se přečíst schránku.",
  "withdraw.address.placeholder": "Zadejte nebo vložte bitcoinovou adresu",
  "withdraw.address.scan": "Naskenovat",
  "withdraw.all.description": "Odeslat celý dostupný zůstatek.",
  "withdraw.all.label": "Vybrat vše",
  "withdraw.amount.available": "Dostupné: {amount} satů",
  "withdraw.amount.invalid": "Zadejte částku větší než 0.",
  "withdraw.amount.label": "Částka",
  "withdraw.amount.placeholder": "Částka v satech",
  "withdraw.continue": "Pokračovat",
  "withdraw.error.accountNotFound": "Spark účet nebyl nalezen.",
  "withdraw.error.insufficientBalance":
    "Tato částka přesahuje váš dostupný zůstatek.",
  "withdraw.form.description":
    "Odešlete Bitcoin ze své Spark peněženky na on-chain adresu.",
  "withdraw.form.title": "Výběr na adresu",
  "withdraw.noAccount.action": "Přejít na platební účty",
  "withdraw.noAccount.description":
    "Před výběrem nastavte Spark peněženku v sekci Platební účty.",
  "withdraw.noAccount.title": "Není nastaven žádný Spark účet",
  "withdraw.quoteError.generic":
    "Nepodařilo se získat odhad poplatku. Zkuste to znovu.",
  "withdraw.quotePending": "Zjišťuji odhad poplatku...",
  "withdraw.result.copied": "ID transakce zkopírováno",
  "withdraw.result.copyError": "Nepodařilo se zkopírovat ID transakce.",
  "withdraw.result.copyTxid": "Kopírovat",
  "withdraw.result.description": "Váš výběr byl odeslán do sítě.",
  "withdraw.result.done": "Hotovo",
  "withdraw.result.status": "Stav",
  "withdraw.result.title": "Výběr odeslán",
  "withdraw.result.txid": "ID transakce",
  "withdraw.result.viewOnExplorer": "Zobrazit na mempool.space",
  "withdraw.review.amount": "Částka výběru",
  "withdraw.review.back": "Zpět",
  "withdraw.review.confirm": "Potvrdit výběr",
  "withdraw.review.confirming": "Odesílám...",
  "withdraw.review.destination": "Cíl",
  "withdraw.review.error.interrupted":
    "Výběr byl přerušen před dokončením. Zkuste to znovu.",
  "withdraw.review.error.recordFailed":
    "Peněženka výběr odeslala, ale Payky nedokázal uložit záznam transakce. Před dalším pokusem zkontrolujte historii.",
  "withdraw.review.error.sparkFailed":
    "Spark odmítl požadavek na výběr. Zkontrolujte zůstatek peněženky a cílovou adresu a zkuste to znovu.",
  "withdraw.review.fee": "Odhadovaný síťový poplatek",
  "withdraw.review.speed.fast": "Rychlý",
  "withdraw.review.speed.medium": "Střední",
  "withdraw.review.speed.slow": "Pomalý",
  "withdraw.review.title": "Kontrola výběru",
  "withdraw.review.total": "Celková odečtená částka",
  "withdraw.review.warning":
    "Bitcoinové transakce nelze vrátit zpět. Před potvrzením zkontrolujte adresu.",
  "withdraw.sats": "{amount} satů",
  "withdraw.scan.close": "Zavřít",
  "withdraw.scan.error":
    "Nepodařilo se získat přístup ke kameře. Zadejte adresu ručně.",
  "withdraw.scan.title": "Naskenovat adresu",
} satisfies Record<keyof typeof enWithdraw, string>
