import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { BankQrFormat } from "@payky/core/modules/account/account-types"
import type { BankQrPayload } from "@payky/core/modules/payment/payment-iban-qr-payload-utils"
import { useState } from "react"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { CopyLink } from "../../components/copy-link.tsx"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

const qrFormatShortKeys = {
  payBySquare1_0_0: "paymentWait.qrFormatShort.payBySquare1_0_0",
  payBySquare1_2_0: "paymentWait.qrFormatShort.payBySquare1_2_0",
  spayd: "paymentWait.qrFormatShort.spayd",
} satisfies Record<BankQrFormat, TranslationKey>

/** Four-character groups for review; casing is kept. */
const groupIban = (iban: string) =>
  iban.replaceAll(/\s+/gu, "").replaceAll(/(.{4})(?=.)/gu, "$1 ")

/** The bank QR, its format switch, the details and the manual "paid" action. */
export function IbanPaymentTab({
  qrPayload,
  qrPayloads,
  activeFormat,
  onSelectFormat,
  iban,
  variableSymbol,
  preparing,
  canMarkPaid,
  pending,
  errorKey,
  onMarkPaid,
}: {
  readonly qrPayload: string | null
  readonly qrPayloads: ReadonlyArray<BankQrPayload>
  readonly activeFormat: BankQrFormat
  readonly onSelectFormat: (format: BankQrFormat) => void
  readonly iban: string
  readonly variableSymbol: string | null
  readonly preparing: boolean
  readonly canMarkPaid: boolean
  readonly pending: boolean
  readonly errorKey: TranslationKey | null
  readonly onMarkPaid: () => void
}) {
  const { t } = useTranslation()
  const [detailsVisible, setDetailsVisible] = useState(false)

  return (
    <YStack gap="3" items="center">
      {qrPayload !== null ? (
        <CopyableQrCode value={qrPayload} />
      ) : preparing ? (
        <YStack items="center" gap="2">
          <ActivityIndicator />
          <Text color="muted-foreground">
            {t("paymentWait.preparing.iban")}
          </Text>
        </YStack>
      ) : null}
      {qrPayloads.length > 1 ? (
        <XStack gap="2">
          {qrPayloads.map(({ format }) => (
            <Button
              size="lg"
              key={format}
              label={t(qrFormatShortKeys[format])}
              variant={format === activeFormat ? "default" : "outline"}
              onPress={() => onSelectFormat(format)}
            />
          ))}
        </XStack>
      ) : null}
      {detailsVisible ? (
        <YStack gap="2" items="center">
          <Text color="muted-foreground">
            {t("paymentWait.ibanDetails.iban.label")}
          </Text>
          <Text>{groupIban(iban)}</Text>
          <CopyLink
            value={iban.replaceAll(/\s+/gu, "")}
            size="icon"
            accessibilityLabel={t("paymentWait.ibanDetails.iban.copy")}
            copied={t("paymentWait.ibanDetails.iban.copied")}
            failed={t("paymentWait.ibanDetails.iban.copyError")}
          />
          {variableSymbol === null ? null : (
            <>
              <Text color="muted-foreground">
                {t("paymentWait.ibanDetails.variableSymbol.label")}
              </Text>
              <Text>{variableSymbol}</Text>
              <CopyLink
                value={variableSymbol}
                size="icon"
                accessibilityLabel={t(
                  "paymentWait.ibanDetails.variableSymbol.copy"
                )}
                copied={t("paymentWait.ibanDetails.variableSymbol.copied")}
                failed={t("paymentWait.ibanDetails.variableSymbol.copyError")}
              />
            </>
          )}
        </YStack>
      ) : null}
      <Button
        size="lg"
        label={
          detailsVisible
            ? t("paymentWait.ibanDetails.hide")
            : t("paymentWait.ibanDetails.show")
        }
        variant="outline"
        onPress={() => setDetailsVisible((visible) => !visible)}
      />
      <Button
        size="lg"
        label={
          pending
            ? t("paymentWait.ibanPaid.pending")
            : t("paymentWait.ibanPaid.action")
        }
        variant="outline"
        pending={pending}
        disabled={!canMarkPaid}
        onPress={onMarkPaid}
      />
      {errorKey === null ? null : (
        <Text color="red-600" accessibilityRole="alert">
          {t(errorKey)}
        </Text>
      )}
    </YStack>
  )
}
