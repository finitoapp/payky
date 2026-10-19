import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { BankQrFormat } from "@payky/core/modules/account/account-types"
import type { BankQrPayload } from "@payky/core/modules/payment/payment-iban-qr-payload-utils"
import Check from "lucide-react-native/icons/check"
import Eye from "lucide-react-native/icons/eye"
import EyeOff from "lucide-react-native/icons/eye-off"
import { useState } from "react"
import { ActivityIndicator } from "react-native"
import { Text, View, XStack, YStack } from "tamagui"
import { CopyLink } from "../../components/copy-link.tsx"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Button } from "../../components/ui/button.tsx"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { fontSize, fontWeight, radius } from "../../theme/tokens.ts"

const qrFormatShortKeys = {
  payBySquare1_0_0: "paymentWait.qrFormatShort.payBySquare1_0_0",
  payBySquare1_2_0: "paymentWait.qrFormatShort.payBySquare1_2_0",
  spayd: "paymentWait.qrFormatShort.spayd",
} satisfies Record<BankQrFormat, TranslationKey>

/** Four-character groups for review; casing is kept. */
const groupIban = (iban: string) =>
  iban.replaceAll(/\s+/gu, "").replaceAll(/(.{4})(?=.)/gu, "$1 ")

/**
 * The bank QR, its format switch, the details and the manual "paid" action,
 * as web's `IbanPaymentTab`: a round pill switch for the QR format, the
 * details as bordered copy rows behind an eye toggle, and the outline
 * "paid" button beside it.
 */
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
    <YStack w="100%" gap={12} items="center">
      {qrPayload !== null ? (
        <CopyableQrCode value={qrPayload} />
      ) : preparing ? (
        <XStack items="center" gap={8}>
          <ActivityIndicator />
          <Text fontSize={fontSize.sm} color="muted-foreground">
            {t("paymentWait.preparing.iban")}
          </Text>
        </XStack>
      ) : null}
      {qrPayloads.length > 1 ? (
        <View
          h={44}
          p={4}
          px={6}
          rounded={radius.full}
          borderWidth={1}
          borderColor="input"
          bg="background"
        >
          <ToggleGroup
            value={activeFormat}
            onValueChange={onSelectFormat}
            spacing={0.5}
          >
            {qrPayloads.map(({ format }) => {
              const selected = format === activeFormat
              return (
                <ToggleGroupItem
                  key={format}
                  value={format}
                  accessibilityLabel={t(qrFormatShortKeys[format])}
                  h={34}
                  minW={48}
                  px={12}
                  rounded={radius.full}
                  borderWidth={0}
                  bg={selected ? "color" : "transparent"}
                >
                  <Text
                    fontSize={fontSize.xs}
                    fontWeight={fontWeight.medium}
                    color={selected ? "background" : "muted-foreground"}
                  >
                    {t(qrFormatShortKeys[format])}
                  </Text>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </View>
      ) : null}
      {detailsVisible ? (
        <YStack w="100%" maxW={320} gap={8}>
          <DetailCopyRow
            label={t("paymentWait.ibanDetails.iban.label")}
            display={groupIban(iban)}
            value={iban.replaceAll(/\s+/gu, "")}
            copyLabel={t("paymentWait.ibanDetails.iban.copy")}
            copied={t("paymentWait.ibanDetails.iban.copied")}
            failed={t("paymentWait.ibanDetails.iban.copyError")}
          />
          {variableSymbol === null ? null : (
            <DetailCopyRow
              label={t("paymentWait.ibanDetails.variableSymbol.label")}
              display={variableSymbol}
              value={variableSymbol}
              copyLabel={t("paymentWait.ibanDetails.variableSymbol.copy")}
              copied={t("paymentWait.ibanDetails.variableSymbol.copied")}
              failed={t("paymentWait.ibanDetails.variableSymbol.copyError")}
            />
          )}
        </YStack>
      ) : null}
      <XStack items="center" gap={8}>
        <Button
          variant="outline"
          size="icon"
          iconStart={detailsVisible ? EyeOff : Eye}
          accessibilityLabel={
            detailsVisible
              ? t("paymentWait.ibanDetails.hide")
              : t("paymentWait.ibanDetails.show")
          }
          accessibilityState={{ selected: detailsVisible }}
          onPress={() => setDetailsVisible((visible) => !visible)}
        />
        <Button
          size="lg"
          variant="outline"
          iconStart={Check}
          label={
            pending
              ? t("paymentWait.ibanPaid.pending")
              : t("paymentWait.ibanPaid.action")
          }
          pending={pending}
          disabled={!canMarkPaid}
          onPress={onMarkPaid}
        />
      </XStack>
      {errorKey === null ? null : (
        <Text
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          color="destructive"
          accessibilityRole="alert"
        >
          {t(errorKey)}
        </Text>
      )}
    </YStack>
  )
}

/** Web's `CopyableDetailRow`: label over the value, a copy button beside. */
function DetailCopyRow({
  label,
  display,
  value,
  copyLabel,
  copied,
  failed,
}: {
  readonly label: string
  readonly display: string
  readonly value: string
  readonly copyLabel: string
  readonly copied: string
  readonly failed: string
}) {
  return (
    <XStack
      items="center"
      justify="space-between"
      gap={12}
      rounded={radius.lg}
      borderWidth={1}
      borderColor="input"
      px={12}
      py={8}
    >
      <YStack shrink={1} minW={0}>
        <Text fontSize={fontSize.xs} color="muted-foreground">
          {label}
        </Text>
        <Text fontSize={fontSize.sm} numberOfLines={1}>
          {display}
        </Text>
      </YStack>
      <CopyLink
        value={value}
        size="icon"
        accessibilityLabel={copyLabel}
        copied={copied}
        failed={failed}
      />
    </XStack>
  )
}
