export const enOnboarding = {
  "accountRestore.action.addRelay": "Add sync server",
  "accountRestore.action.otherPhrase": "Use a different recovery phrase",
  "accountRestore.action.retry": "Try again",
  "accountRestore.action.setupNew": "Set up this account as new",
  "accountRestore.description":
    "Waiting for the account data to sync. This usually takes a few seconds.",
  "accountRestore.empty.description":
    "Every sync server finished syncing, but none of them holds data for this recovery phrase. The data may be on a server that isn't listed, or the phrase may belong to a different account.",
  "accountRestore.empty.title": "No account data found",
  "accountRestore.failed.description":
    "Some sync servers could not be synced with, so the account data may exist but hasn't arrived. Check the list and try again.",
  "accountRestore.failed.offline":
    "This device is offline. Connect to the internet and try again.",
  "accountRestore.failed.title": "Couldn't sync the account",
  "accountRestore.relays.title": "Sync servers",
  "accountRestore.setupNew.confirm.cancel": "Go back",
  "accountRestore.setupNew.confirm.confirm": "Set up as new",
  "accountRestore.setupNew.confirm.description":
    "The unreachable sync servers may still hold this account's data. If it syncs later, the settings you choose now will overwrite it.",
  "accountRestore.setupNew.confirm.title": "Set up without the account data?",
  "accountRestore.syncing": "Syncing account data…",
  "accountRestore.title": "Restoring account",
  "onboarding.account.description":
    "Save the phrase below somewhere safe. You will need it to open this account on another device.",
  "onboarding.account.mnemonic.confirm":
    "I've saved my recovery phrase somewhere safe",
  "onboarding.account.mnemonic.required":
    "Confirm you have saved the recovery phrase before finishing.",
  "onboarding.account.title": "Back up your account",
  "onboarding.accountChoice.description":
    "Create a new account for this device or restore one you already use.",
  "onboarding.accountChoice.new.description":
    "Generate a new recovery phrase and start with an empty account.",
  "onboarding.accountChoice.new.title": "Create a new account",
  "onboarding.accountChoice.restore.description":
    "Use a recovery phrase to open your existing account data.",
  "onboarding.accountChoice.restore.title": "Restore an existing account",
  "onboarding.accountChoice.title": "Choose an account",
  "onboarding.back": "Back",
  "onboarding.cancelSetup": "Cancel account creation",
  "onboarding.cancelSetup.confirm.cancel": "Keep setting up",
  "onboarding.cancelSetup.confirm.confirm": "Cancel account creation",
  "onboarding.cancelSetup.confirm.description":
    "This new account will be discarded and you'll switch back to {name}.",
  "onboarding.cancelSetup.confirm.title": "Cancel account creation?",
  "onboarding.countryCurrency.country.description":
    "Preloads the tax rates your catalog starts with.",
  "onboarding.countryCurrency.currency.description":
    "Every amount you enter in the terminal is in this currency.",
  "onboarding.countryCurrency.currency.label": "Currency",
  "onboarding.countryCurrency.description":
    "Both only preset how Payky works for you — you can change either later in Settings.",
  "onboarding.countryCurrency.title": "Country and currency",
  "onboarding.finish": "Finish",
  "onboarding.language.title": "Choose language",
  "onboarding.next": "Next",
  "onboarding.payments.btc.description":
    "Accept Bitcoin payments through the Spark Lightning account.",
  "onboarding.payments.btc.title": "Bitcoin",
  "onboarding.payments.cash.description":
    "Record in-person cash payments in the terminal.",
  "onboarding.payments.cash.title": "Cash",
  "onboarding.payments.description":
    "Select the payment methods this terminal should accept.",
  "onboarding.payments.iban.description":
    "Show bank transfer QR codes for fiat payments.",
  "onboarding.payments.iban.title": "Bank transfer",
  "onboarding.payments.title": "Payment methods",
  "onboarding.progress": "Step",
  "onboarding.restore.action": "Restore account",
  "onboarding.restore.description":
    "Enter the SLIP-39 recovery phrase for the account you want to restore.",
  "onboarding.restore.title": "Restore existing account",
  "onboarding.title": "Set up Payky",
  "posLogin.cancel": "Cancel",
  "posLogin.confirm": "Open PoS",
  "posLogin.description":
    "This device becomes a PoS of the business that sent you the link. It takes payments for the owner and passes every sale on to them.",
  "posLogin.invalid.description":
    "The link may be cut short. Ask the owner to send it again and open it whole.",
  "posLogin.invalid.home": "Go to the app",
  "posLogin.invalid.title": "This PoS link doesn't work",
  "posLogin.otherAccounts":
    "This device holds other accounts. Anyone at this PoS can leave PoS mode and open them.",
  "posLogin.title": "Open this PoS",
  "recovery.accounts.description": "Switching reboots the app on that account.",
  "recovery.description":
    "This page works even when the app itself cannot start. It reads only this device's own database, never an account's data.",
  "recovery.export.description":
    "A copy of the accounts and device settings stored on this device — not an account's bills or payments.",
  "recovery.switch.error": "Could not switch the account.",
  "recovery.title": "Recover access",
} as const
