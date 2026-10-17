import type { BillCoverageMismatchReason } from "@payky/app-shared/activity-detail"
import { formatMoney } from "@payky/app-shared/format-money"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import type { TaxRecapRow } from "@payky/core/modules/bill-line/bill-line-tax-utils"
import { getBillLineSummaryUnitAmount } from "@payky/core/modules/bill-line/bill-line-utils"
import type { PaymentStatus } from "@payky/core/modules/payment/payment-types"
import {
  type Currency,
  Integer,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { taxRatePercentageToDecimalString } from "@payky/core/modules/tax-rate/tax-rate-utils"
import { type ReactNode, useState } from "react"
import { Pressable, Text as RNText, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import type { StatusTone } from "./activity-parts.tsx"

/** The building blocks of the payment and bill detail screens. */

/** Header and a scrolling column; `title` is already translated. */
export function DetailScreen({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  const theme = useTheme()

  return (
    <SafeAreaView
      style={{
        flex: 1,
        paddingHorizontal: 16,
        backgroundColor: theme.background.val,
      }}
    >
      <ScreenHeader title={title} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function Card({
  title,
  subtitle,
  badge,
  children,
}: {
  readonly title?: string | undefined
  readonly subtitle?: string | undefined
  readonly badge?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <YStack
      gap="3"
      p="3"
      rounded="xl"
      borderWidth={1}
      borderColor="border-color"
      bg="card"
    >
      {title === undefined &&
      subtitle === undefined &&
      badge === undefined ? null : (
        <XStack justify="space-between" items="flex-start" gap="2">
          <YStack flex={1}>
            {title === undefined ? null : (
              <Text fontSize={17} fontWeight="600">
                {title}
              </Text>
            )}
            {subtitle === undefined ? null : (
              <Text color="muted-foreground">{subtitle}</Text>
            )}
          </YStack>
          {badge}
        </XStack>
      )}
      {children}
    </YStack>
  )
}

const toneColors = {
  success: "green-600",
  warning: "orange-600",
  danger: "red-600",
  muted: "muted-foreground",
} as const satisfies Record<StatusTone, string>

export const paymentStatusTone = {
  paid: "success",
  pending: "warning",
  expired: "muted",
  canceled: "danger",
} as const satisfies Record<PaymentStatus, StatusTone>

export function StatusBadge({
  label,
  tone,
}: {
  readonly label: string
  readonly tone: StatusTone
}) {
  return (
    <Text
      fontSize={12}
      fontWeight="600"
      color={toneColors[tone]}
      borderWidth={1}
      borderColor={toneColors[tone]}
      rounded="sm"
      px="2"
      py="0.5"
    >
      {label}
    </Text>
  )
}

export function DetailRow({
  label,
  value,
  emphasize = false,
  mono = false,
}: {
  readonly label: string
  readonly value: string
  readonly emphasize?: boolean
  /** Identifiers: selectable so they can be copied by long-press. */
  readonly mono?: boolean
}) {
  const theme = useTheme()

  return (
    <XStack justify="space-between" gap="3">
      <Text color="muted-foreground">{label}</Text>
      {mono ? (
        <RNText
          selectable
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: "right",
            fontSize: 12,
            color: theme.color.val,
          }}
        >
          {value}
        </RNText>
      ) : (
        <Text flex={1} text="right" fontWeight={emphasize ? "600" : "400"}>
          {value}
        </Text>
      )}
    </XStack>
  )
}

/** A row that is not shown at all while its value is absent. */
export function OptionalRow({
  label,
  value,
  mono,
}: {
  readonly label: string
  readonly value: string | null
  readonly mono?: boolean
}) {
  if (value === null) return null
  return <DetailRow label={label} value={value} mono={mono === true} />
}

/** Identifiers and bookkeeping staff rarely need, collapsed by default. */
export function Technical({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <YStack gap="2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
      >
        <Text fontSize={13} fontWeight="600" color="muted-foreground">
          {`${t("paymentDetail.technical")} ${open ? "▴" : "▾"}`}
        </Text>
      </Pressable>
      {open ? <YStack gap="2">{children}</YStack> : null}
    </YStack>
  )
}

/** A warning panel: title, then the facts under it. */
export function WarningPanel({
  title,
  children,
}: {
  readonly title: string
  readonly children?: ReactNode
}) {
  return (
    <YStack
      gap="2"
      p="3"
      rounded="lg"
      borderWidth={1}
      borderColor="orange-600"
      accessibilityRole="alert"
    >
      <Text fontWeight="600" color="orange-600">
        {`⚠ ${title}`}
      </Text>
      {children}
    </YStack>
  )
}

export function BillLines({
  summaries,
  emptyMessage,
}: {
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly emptyMessage: string
}) {
  const locale = useLocale()

  if (summaries.length === 0)
    return <Text color="muted-foreground">{emptyMessage}</Text>

  return (
    <YStack gap="2">
      {summaries.map((summary) => (
        <XStack key={summary.id} justify="space-between" gap="3">
          <YStack flex={1}>
            <Text numberOfLines={1} fontWeight="600">
              {summary.name}
            </Text>
            <Text fontSize={12} color="muted-foreground">
              {`${summary.quantity} × ${formatMoney(
                {
                  value: getBillLineSummaryUnitAmount(summary),
                  currency: summary.currency,
                },
                locale
              )}`}
            </Text>
          </YStack>
          <Text fontWeight="600">
            {formatMoney(
              { value: summary.totalAmount, currency: summary.currency },
              locale
            )}
          </Text>
        </XStack>
      ))}
    </YStack>
  )
}

/** VAT breakdown by rate; nothing when no line carries a tax rate. */
export function TaxRecap({
  rows,
  currency,
}: {
  readonly rows: ReadonlyArray<TaxRecapRow>
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = (value: number) =>
    formatMoney({ value: Integer(value), currency }, locale)

  return (
    <YStack gap="2">
      <Text fontSize={13} fontWeight="600" color="muted-foreground">
        {t("taxRecap.title")}
      </Text>
      {rows.map((row) => (
        <XStack key={row.taxRateId ?? "none"} justify="space-between" gap="3">
          <YStack flex={1}>
            <Text numberOfLines={1} fontWeight="600">
              {row.name === null || row.ratePercentage === null
                ? t("taxRecap.noTax")
                : t("taxRecap.rateLabel", {
                    name: row.name,
                    rate: taxRatePercentageToDecimalString(row.ratePercentage),
                  })}
            </Text>
            <Text fontSize={12} color="muted-foreground">
              {`${t("taxRecap.base")}: ${money(row.baseAmount)} · ${t("taxRecap.tax")}: ${money(row.taxAmount)}`}
            </Text>
          </YStack>
          <Text fontWeight="600">{money(row.grossAmount)}</Text>
        </XStack>
      ))}
    </YStack>
  )
}

/** "This bill's claimed total doesn't match its line total": expected vs. paid. */
export function BillCoverageWarning({
  coverage,
  expectedAmount,
  claimedSum,
  currency,
  reason = null,
  children,
}: {
  readonly coverage: "underpaid" | "overpaid"
  readonly expectedAmount: NonNegativeInteger
  readonly claimedSum: NonNegativeInteger
  readonly currency: Currency
  readonly reason?: BillCoverageMismatchReason | null
  readonly children?: ReactNode
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const isUnderpaid = coverage === "underpaid"
  const delta = NonNegativeInteger(Math.abs(expectedAmount - claimedSum))

  return (
    <WarningPanel
      title={t(
        isUnderpaid
          ? "paymentDetail.bill.coverage.underpaid.title"
          : "paymentDetail.bill.coverage.overpaid.title"
      )}
    >
      <Text fontWeight="600">
        {t(
          isUnderpaid
            ? "paymentDetail.bill.coverage.delta.underpaid"
            : "paymentDetail.bill.coverage.delta.overpaid",
          { amount: formatMoney({ value: delta, currency }, locale) }
        )}
      </Text>
      <Text>
        {reason === null
          ? t(
              isUnderpaid
                ? "paymentDetail.bill.coverage.underpaid.fact"
                : "paymentDetail.bill.coverage.overpaid.fact"
            )
          : t(
              isUnderpaid
                ? "paymentDetail.bill.coverage.underpaid.factWithReason"
                : "paymentDetail.bill.coverage.overpaid.factWithReason",
              { reason: t(`paymentDetail.bill.coverage.reason.${reason}`) }
            )}
      </Text>
      <DetailRow
        label={t("paymentDetail.bill.coverage.expectedAmount")}
        value={formatMoney({ value: expectedAmount, currency }, locale)}
      />
      <DetailRow
        label={t("paymentDetail.bill.coverage.paidAmount")}
        value={formatMoney({ value: claimedSum, currency }, locale)}
      />
      {children}
    </WarningPanel>
  )
}
