export const enWithdraw = {
  "withdraw.all.description": "Send the entire available balance.",
  "withdraw.all.label": "Withdraw all",
  "withdraw.all.unavailableAddress":
    "A Lightning address takes an exact amount, so the fee reserve can't be deducted.",
  "withdraw.all.unavailableInvoice": "The invoice sets the amount.",
  "withdraw.amount.available": "Available: {amount} sats",
  "withdraw.amount.fromInvoice": "The invoice sets the amount.",
  "withdraw.amount.invalid": "Enter an amount greater than 0.",
  "withdraw.amount.label": "Amount",
  "withdraw.amount.onchainMinimum":
    "On-chain withdrawals start at {amount} sats.",
  "withdraw.amount.placeholder": "Amount in sats",
  "withdraw.amount.placeholderFiat": "Amount in {currency}",
  "withdraw.amount.range": "From {min} to {max} sats.",
  "withdraw.amount.unit": "Amount unit",
  "withdraw.amount.unitSats": "sats",
  "withdraw.clipboard.use": "Use from clipboard: {value}",
  "withdraw.continue": "Continue",
  "withdraw.destination.checkingAddress": "Checking the Lightning address…",
  "withdraw.destination.invalid":
    "Enter a Bitcoin address, a Lightning invoice or a Lightning address.",
  "withdraw.destination.kind.lightningAddress": "Lightning address",
  "withdraw.destination.kind.lightningInvoice": "Lightning invoice",
  "withdraw.destination.kind.onchain": "Bitcoin address (on-chain)",
  "withdraw.destination.label": "Send to",
  "withdraw.destination.paste": "Paste",
  "withdraw.destination.pasteError": "Couldn't read the clipboard.",
  "withdraw.destination.placeholder":
    "Address, Lightning invoice or name@domain",
  "withdraw.destination.scan": "Scan",
  "withdraw.detail.amount": "Amount",
  "withdraw.detail.balanceNow":
    "The wallet holds {balance} sats now; this withdrawal would deduct {amount} sats.",
  "withdraw.detail.cancel": "Cancel",
  "withdraw.detail.copied": "Copied",
  "withdraw.detail.copy": "Copy",
  "withdraw.detail.copyError": "Couldn't copy.",
  "withdraw.detail.date": "Date",
  "withdraw.detail.destination": "Destination",
  "withdraw.detail.device": "Device",
  "withdraw.detail.failed.manual": "The money did not leave.",
  "withdraw.detail.failed.notCreated": "The payment did not leave.",
  "withdraw.detail.failed.notCreatedHint":
    "Check your balance. If the money is still in the wallet, start a new withdrawal from the withdrawal history.",
  "withdraw.detail.failed.rejected": "The money did not leave.",
  "withdraw.detail.failed.returned": "The money returned to the wallet.",
  "withdraw.detail.fee": "Fee",
  "withdraw.detail.invoice": "Invoice",
  "withdraw.detail.invoiceRenewHint":
    "A Lightning invoice can be paid only once. Ask the recipient for a new one.",
  "withdraw.detail.lightningAddress": "Lightning address",
  "withdraw.detail.manualConfirmed":
    "Confirmed by hand; the transaction was not traced.",
  "withdraw.detail.markNotSent": "The money did not leave",
  "withdraw.detail.markNotSent.description":
    "Do this only if the wallet balance still includes {amount} sats.",
  "withdraw.detail.markNotSent.title": "Mark the withdrawal as not sent?",
  "withdraw.detail.markSent": "The money left",
  "withdraw.detail.markSent.description":
    "This records {amount} sats leaving the wallet.",
  "withdraw.detail.markSent.title": "Mark the withdrawal as sent?",
  "withdraw.detail.maxFee": "Maximum fee",
  "withdraw.detail.movementDeleted": "The account transaction was deleted.",
  "withdraw.detail.newWithdrawal": "New withdrawal",
  "withdraw.detail.notFound": "This withdrawal could not be found.",
  "withdraw.detail.onchainUncertain":
    "The result is not certain. Check your balance.",
  "withdraw.detail.pending.otherDevice":
    "Waiting for the result. Device {device} started this withdrawal; if the payment doesn't leave, it is marked as not sent within 24 hours.",
  "withdraw.detail.pending.ownDevice":
    "Waiting for the result. If the payment doesn't leave within 10 minutes, the withdrawal marks itself as not sent.",
  "withdraw.detail.pending.processing":
    "The payment is still being processed. It is waiting to complete, or for the recipient to claim it.",
  "withdraw.detail.pending.unknown":
    "The result could not be determined. Check your balance and the account transactions.",
  "withdraw.detail.pending.unknownDevice":
    "Waiting for the result. Another device started this withdrawal; if the payment doesn't leave, it is marked as not sent within 24 hours.",
  "withdraw.detail.preimage": "Preimage",
  "withdraw.detail.sparkTransferId": "Spark transfer ID",
  "withdraw.detail.status": "Status",
  "withdraw.detail.technical": "Technical details",
  "withdraw.detail.title": "Withdrawal",
  "withdraw.detail.total": "Total deducted",
  "withdraw.detail.txid": "Transaction ID",
  "withdraw.detail.txidError": "The transaction could not be loaded.",
  "withdraw.detail.txidPending": "The transaction is not on the network yet.",
  "withdraw.detail.type": "Type",
  "withdraw.detail.viewOnExplorer": "View on mempool.space",
  "withdraw.error.accountNotFound": "The Spark account could not be found.",
  "withdraw.error.amountOutOfRange":
    "This Lightning address accepts {min} to {max} sats.",
  "withdraw.error.belowMinimum":
    "An on-chain withdrawal must be at least {amount} sats.",
  "withdraw.error.insufficientBalance":
    "This amount exceeds your available balance.",
  "withdraw.error.insufficientBalanceMax":
    "This amount and the fee exceed your balance. You can send at most {amount} sats.",
  "withdraw.error.lightningAddressMismatch":
    "The Lightning address returned an invoice that doesn't match. Nothing was paid.",
  "withdraw.error.lightningAddressUnavailable":
    "Couldn't reach the Lightning address. Check it and try again.",
  "withdraw.error.lightningInvoiceExpired":
    "The invoice has expired. Get a new estimate, or ask the recipient for a new invoice.",
  "withdraw.error.lightningInvoiceWrongNetwork":
    "This invoice is not for the Bitcoin mainnet.",
  "withdraw.error.lnurlNotSupported":
    "Use a Lightning address (name@domain) or an invoice.",
  "withdraw.error.quoteExpired":
    "The fee estimate has expired. Get a new estimate.",
  "withdraw.error.selfWithdrawal":
    "This would send the money back to this wallet.",
  "withdraw.error.sparkDestinationNotSupported":
    "Ask the recipient for a Lightning invoice or a Lightning address.",
  "withdraw.form.description":
    "Send bitcoin from your Spark wallet to an on-chain address, a Lightning invoice or a Lightning address.",
  "withdraw.form.title": "New withdrawal",
  "withdraw.history.balance": "Balance: {amount} sats",
  "withdraw.history.empty": "No withdrawals yet.",
  "withdraw.history.new": "New withdrawal",
  "withdraw.history.olderNote":
    "Older withdrawals are in the Spark account's transactions.",
  "withdraw.history.title": "Withdrawals",
  "withdraw.history.transactionsLink": "Account transactions",
  "withdraw.kind.lightning": "Lightning",
  "withdraw.kind.onchain": "On-chain",
  "withdraw.noAccount.action": "Go to payment accounts",
  "withdraw.noAccount.description":
    "Set up a Spark wallet in Payment accounts before withdrawing.",
  "withdraw.noAccount.title": "No Spark account configured",
  "withdraw.quoteError.generic": "Couldn't fetch a fee estimate. Try again.",
  "withdraw.quotePending": "Fetching fee estimate...",
  "withdraw.review.amount": "Withdrawal amount",
  "withdraw.review.back": "Back",
  "withdraw.review.confirm": "Confirm withdrawal",
  "withdraw.review.confirming": "Sending...",
  "withdraw.review.destination": "Destination",
  "withdraw.review.error.generic":
    "The withdrawal could not be started. Try again.",
  "withdraw.review.error.interrupted":
    "The withdrawal was interrupted before it completed. Try again.",
  "withdraw.review.expiresAt": "Invoice valid until",
  "withdraw.review.expiresIn": "Invoice valid for",
  "withdraw.review.fee": "Estimated network fee",
  "withdraw.review.invoiceDescription": "Invoice description",
  "withdraw.review.maxFee": "Maximum fee",
  "withdraw.review.maxFeeSpark":
    "Usually free (over Spark), at most {amount} sats",
  "withdraw.review.maxTotal": "At most deducted",
  "withdraw.review.newQuote": "New estimate",
  "withdraw.review.pinDetail": "{amount} sats → {destination}",
  "withdraw.review.recipientText": "Text from the recipient",
  "withdraw.review.remainder":
    "Whatever the fee doesn't use, up to {amount} sats, stays in your wallet.",
  "withdraw.review.showInvoice": "Show invoice",
  "withdraw.review.speed.fast": "Fast",
  "withdraw.review.speed.fast.hint": "Highest priority",
  "withdraw.review.speed.medium": "Medium",
  "withdraw.review.speed.medium.hint": "Balanced",
  "withdraw.review.speed.slow": "Slow",
  "withdraw.review.speed.slow.hint": "Lowest fee",
  "withdraw.review.title": "Review withdrawal",
  "withdraw.review.total": "Total amount deducted",
  "withdraw.review.warning":
    "Bitcoin transactions cannot be reversed. Double-check the destination before confirming.",
  "withdraw.sats": "{amount} sats",
  "withdraw.scan.close": "Close",
  "withdraw.scan.error":
    "Couldn't access the camera. Enter the destination manually.",
  "withdraw.scan.title": "Scan destination",
  "withdraw.status.done": "Completed",
  "withdraw.status.failed": "Failed",
  "withdraw.status.pending": "In progress",
  "withdraw.status.sent": "Sent",
  "withdraw.transactions.empty": "No transactions yet.",
  "withdraw.transactions.kind.spark": "Spark",
  "withdraw.transactions.title": "Account transactions",
} as const
