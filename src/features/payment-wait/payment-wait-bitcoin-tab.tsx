import { Suspense, useMemo } from "react"

import {
  type BitcoinQrMode,
  bitcoinQrModes,
  buildBitcoinQrPayloads,
} from "@/core/modules/payment/payment-bitcoin-uri-utils.ts"
import { buildCashuPaymentRequest } from "@/core/modules/payment/payment-cashu-request-utils.ts"
import { QrModeToggle } from "@/features/payment-wait/payment-wait-qr-mode-toggle.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import type {
  BitcoinPaymentMethodOption,
  PreparedCashuRequest,
} from "@/features/payment-wait/payment-wait-types.ts"
import { useLinkyIdentity, useNostrRelays } from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const bitcoinQrModeLabelKeys = {
  cashu: "paymentWait.bitcoinQrMode.cashu",
  universal: "paymentWait.bitcoinQrMode.universal",
  lightning: "paymentWait.bitcoinQrMode.lightning",
} satisfies Record<BitcoinQrMode, TranslationKey>

export function BitcoinPaymentTab({
  method,
  preparingMessageKey,
  selectedQrMode,
  onSelectQrMode,
}: {
  readonly method: BitcoinPaymentMethodOption
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedQrMode: BitcoinQrMode
  readonly onSelectQrMode: (mode: BitcoinQrMode) => void
}) {
  if (method.cashuRequest === null) {
    return (
      <QrPaymentRequest
        qrPayload={method.qrPayload}
        preparingMessageKey={preparingMessageKey}
      />
    )
  }

  // The request is addressed to the account's Nostr identity, which the
  // shared store answers asynchronously; until then the QR shows as still
  // preparing rather than falling back to a payload without the request.
  return (
    <Suspense
      fallback={
        <QrPaymentRequest
          qrPayload={null}
          preparingMessageKey="paymentWait.preparing.spark"
        />
      }
    >
      <CashuBitcoinQr
        cashuRequest={method.cashuRequest}
        preparingMessageKey={preparingMessageKey}
        selectedQrMode={selectedQrMode}
        onSelectQrMode={onSelectQrMode}
      />
    </Suspense>
  )
}

function CashuBitcoinQr({
  cashuRequest,
  preparingMessageKey,
  selectedQrMode,
  onSelectQrMode,
}: {
  readonly cashuRequest: PreparedCashuRequest
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedQrMode: BitcoinQrMode
  readonly onSelectQrMode: (mode: BitcoinQrMode) => void
}) {
  const { t } = useTranslation()
  const identity = useLinkyIdentity()
  const relays = useNostrRelays(identity)
  const { amountSats, mintUrl, quoteId, lightningInvoice, sparkInvoice } =
    cashuRequest
  const encodedRequest = useMemo(
    () =>
      buildCashuPaymentRequest({
        amountSats,
        mintUrl,
        quoteId,
        recipient: { pubkey: identity.pubkey, relays },
      }),
    [amountSats, mintUrl, quoteId, identity.pubkey, relays]
  )
  const payloads = buildBitcoinQrPayloads({
    lightningInvoice,
    sparkInvoice,
    cashuRequest: encodedRequest,
  })
  const activeQrMode =
    payloads[selectedQrMode] === null ? "universal" : selectedQrMode

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <QrPaymentRequest
        qrPayload={payloads[activeQrMode]}
        preparingMessageKey={preparingMessageKey}
      />
      <QrModeToggle<BitcoinQrMode>
        ariaLabel={t("paymentWait.bitcoinQrMode.label")}
        value={activeQrMode}
        onChange={onSelectQrMode}
        options={bitcoinQrModes.map((mode) => ({
          value: mode,
          label: t(bitcoinQrModeLabelKeys[mode]),
          ariaLabel: t(bitcoinQrModeLabelKeys[mode]),
          disabled: payloads[mode] === null,
        }))}
      />
    </div>
  )
}
