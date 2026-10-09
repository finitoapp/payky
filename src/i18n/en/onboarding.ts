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
  "accountTransfer.cancel": "Cancel",
  "accountTransfer.close": "Close",
  "accountTransfer.done": "Done",
  "accountTransfer.settings.source.description":
    "Open this account on a phone or another computer without the recovery phrase. It lives in Settings → Access, next to the device permissions.",
  "accountTransfer.settings.source.title": "Add a device to this account",
  "accountTransfer.source.code.confirm": "Confirm and transfer",
  "accountTransfer.source.code.connected": "A device connected.",
  "accountTransfer.source.code.instructions":
    "Type the 6-digit code shown on the new device.",
  "accountTransfer.source.code.label": "Code from the new device",
  "accountTransfer.source.code.mismatch":
    "The code does not match. Check it and try again. Attempts left: {count}.",
  "accountTransfer.source.code.warning":
    "Only copy it from the screen of the device in your hand. If someone is reading a code to you, cancel.",
  "accountTransfer.source.done.acked":
    "The new device received the account. Finish on the new device. Nothing changes on this device.",
  "accountTransfer.source.done.sent": "Sent. Finish on the new device.",
  "accountTransfer.source.done.title": "Account sent",
  "accountTransfer.source.failed.cancelled":
    "The transfer was cancelled on the new device.",
  "accountTransfer.source.failed.codeMismatch":
    "The code didn't match three times.",
  "accountTransfer.source.failed.conflict":
    "More than one device answered the code, so the transfer was stopped for safety. If the other one wasn't yours, someone may have seen your screen.",
  "accountTransfer.source.failed.network":
    "Couldn't reach the transfer server. Check your internet connection.",
  "accountTransfer.source.failed.nothingSent": "Nothing was sent.",
  "accountTransfer.source.failed.timeout":
    "The new device didn't finish in time.",
  "accountTransfer.source.failed.title": "Transfer stopped",
  "accountTransfer.source.permissions":
    "The new device starts with no permissions. Set them in Settings → Access once it appears there.",
  "accountTransfer.source.qr.expired": "This code has expired.",
  "accountTransfer.source.qr.instructions":
    "On the new device open Payky, choose “Transfer from another device” and scan this code.",
  "accountTransfer.source.qr.label": "QR code for the new device",
  "accountTransfer.source.qr.reassurance":
    "The code expires in two minutes and works for one device only.",
  "accountTransfer.source.qr.renew": "Create a new code",
  "accountTransfer.source.qr.validFor": "Valid for {time}",
  "accountTransfer.source.qr.waiting": "Waiting for the new device…",
  "accountTransfer.source.sending": "Sending the account…",
  "accountTransfer.source.start": "Show QR code",
  "accountTransfer.source.startAgain": "Start again",
  "accountTransfer.source.step.code": "Type the code from the new device here.",
  "accountTransfer.source.step.scan": "Scan the QR code with the new device.",
  "accountTransfer.source.step.transfer": "The account moves over, encrypted.",
  "accountTransfer.source.title": "Add a device",
  "accountTransfer.source.warning.description":
    "The new device gets full access to this account, including the money in the Bitcoin wallet. Only continue with a device you are holding. Payky support will never ask you to do this.",
  "accountTransfer.source.warning.title": "Full access to the account",
  "accountTransfer.target.added":
    "Account “{name}” was added to this device and is now active. Loading your data…",
  "accountTransfer.target.alreadyAdded":
    "This account was already on this device; it is now active.",
  "accountTransfer.target.code.instructions":
    "Type this code on your other device.",
  "accountTransfer.target.code.waiting": "Waiting for confirmation…",
  "accountTransfer.target.code.warning":
    "The code confirms the account is going to this device. Don't share it with anyone.",
  "accountTransfer.target.confirm.cancel": "Cancel",
  "accountTransfer.target.confirm.confirm": "Add and switch",
  "accountTransfer.target.confirm.description":
    "Add account “{name}” to this device and switch to it? Payments you take will then go to this account.",
  "accountTransfer.target.confirm.title": "Add account “{name}”?",
  "accountTransfer.target.connecting": "Connecting to your other device…",
  "accountTransfer.target.description":
    "Scan a QR code on a device where you already use Payky.",
  "accountTransfer.target.error.InvalidPaykyUri":
    "The code is damaged. Generate a new one.",
  "accountTransfer.target.error.NotPaykyUri": "This is not a Payky code.",
  "accountTransfer.target.error.UnknownPaykyUriType":
    "This Payky code is for something else, or for a newer Payky. Update the app.",
  "accountTransfer.target.error.UnsupportedPaykyUriVersion":
    "This code was made by a newer Payky. Update the app.",
  "accountTransfer.target.error.WrongPaykyUriType":
    "This Payky code is for something else.",
  "accountTransfer.target.failed.cancelled":
    "The transfer was cancelled on the other device.",
  "accountTransfer.target.failed.codeMismatch":
    "The code was typed wrong three times on the other device.",
  "accountTransfer.target.failed.conflict":
    "More than one device answered the code, so the transfer was stopped for safety.",
  "accountTransfer.target.failed.invalid":
    "The other device sent data this device can't use. Nothing was added.",
  "accountTransfer.target.failed.network":
    "Couldn't reach the transfer server. Check your internet connection.",
  "accountTransfer.target.failed.timeout":
    "The other device didn't finish in time.",
  "accountTransfer.target.failed.title": "Transfer stopped",
  "accountTransfer.target.fallback":
    "Can't scan? Restore with your recovery phrase.",
  "accountTransfer.target.instructions":
    "On the device that has your account, open Settings → Access → Add a device, then scan the QR code it shows.",
  "accountTransfer.target.scanAgain": "Scan again",
  "accountTransfer.target.title": "Transfer from another device",
  "accountTransfer.target.warning.description":
    "Only scan a code from your own device that you are looking at right now. A code from someone else would put their account on this device, and payments you take would go to them.",
  "accountTransfer.target.warning.title": "Only your own device",
  "onboarding.account.description":
    "Save the phrase below somewhere safe. You will need it to open this account on another device.",
  "onboarding.account.mnemonic.confirm":
    "I've saved my recovery phrase somewhere safe",
  "onboarding.account.mnemonic.required":
    "Confirm you have saved the recovery phrase before finishing.",
  "onboarding.account.title": "Back up your account",
  "onboarding.accountChoice.description":
    "Create a new account for this device or restore one you already use.",
  "accountChoice.new.description":
    "Generate a new recovery phrase and start with an empty account.",
  "accountChoice.new.title": "Create a new account",
  "accountChoice.restore.description":
    "Use a recovery phrase to open your existing account data.",
  "accountChoice.restore.title": "Restore an existing account",
  "accountChoice.transfer.description":
    "Scan a QR code on a device where you already use Payky.",
  "accountChoice.transfer.title": "Transfer from another device",
  "onboarding.accountChoice.title": "Choose an account",
  "onboarding.back": "Back",
  "onboarding.alreadyOnboarded": "This account is already set up.",
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
} as const
