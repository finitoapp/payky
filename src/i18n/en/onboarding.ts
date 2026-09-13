export const enOnboarding = {
  "accountRestore.description":
    "Waiting for the account data to sync. This usually takes a few seconds.",
  "accountRestore.timeout.continue": "Keep waiting",
  "accountRestore.timeout.description":
    "No account settings have arrived yet. You can keep waiting or explicitly set up this account as new.",
  "accountRestore.timeout.setup": "Set up as a new account",
  "accountRestore.timeout.title": "Still restoring account",
  "accountRestore.title": "Restoring account",
  "onboarding.account.description":
    "Review the identity Payky generated for this device. You can rename it and turn on sync now or later in Settings.",
  "onboarding.account.mnemonic.confirm":
    "I've saved my recovery phrase somewhere safe",
  "onboarding.account.name.description":
    "Shown in the accounts list when switching identities.",
  "onboarding.account.name.error.required": "Enter an account name.",
  "onboarding.account.name.label": "Account name",
  "onboarding.account.title": "Your account",
  "onboarding.account.transport.description":
    "Turn on sync to back up this account and use it on other devices.",
  "onboarding.account.transport.title": "Sync",
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
  "onboarding.country.description":
    "This sets sensible tax rate defaults for your catalog.",
  "onboarding.country.title": "Choose your country",
  "onboarding.country.vatPayer.description":
    "Turns on tax rates for catalog items. You can change this later in Settings.",
  "onboarding.country.vatPayer.label": "I am a VAT payer",
  "onboarding.finish": "Finish",
  "onboarding.language.description": "Choose the language used across the app.",
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
  "recovery.accounts.description": "Switching reboots the app on that account.",
  "recovery.description":
    "This page works even when the app itself cannot start. It reads only this device's own database, never an account's data.",
  "recovery.export.description":
    "A copy of the accounts and device settings stored on this device — not an account's bills or payments.",
  "recovery.switch.error": "Could not switch the account.",
  "recovery.title": "Recover access",
} as const
