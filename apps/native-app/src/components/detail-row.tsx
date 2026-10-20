import type { ReactNode } from "react"
import { Text as RNText } from "react-native"
import { Text, useTheme, View, XStack } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { fontSize, fontWeight } from "../theme/tokens.ts"
import { CopyLink } from "./copy-link.tsx"

/**
 * Web `apps/web-app/src/components/detail-row.tsx`: a label and its value in
 * a detail card, side by side, or `stacked` for long values.
 *
 * Tailwind mirrored: `flex items-start justify-between gap-4 text-sm`
 * (`stacked`: `flex-col gap-1`), the label `text-muted-foreground`, the value
 * `max-w-56 text-right font-medium` (`emphasize`: `font-semibold`).
 *
 * Native addition: `mono` is web's payment-detail copy row folded in, an
 * identifier drawn small, selectable and one line, with a Copy link.
 */
export function DetailRow({
  label,
  value,
  stacked = false,
  emphasize = false,
  mono = false,
  children,
}: {
  readonly label: string
  readonly value?: string
  readonly stacked?: boolean
  readonly emphasize?: boolean
  /** Identifiers: selectable, with a Copy link. */
  readonly mono?: boolean
  readonly children?: ReactNode
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const weight = emphasize ? fontWeight.semibold : fontWeight.medium

  if (mono && value !== undefined) {
    return (
      <XStack justify="space-between" items="center" gap={16}>
        <Text
          fontSize={fontSize.sm}
          lineHeight={fontSize.sm}
          color="muted-foreground"
        >
          {label}
        </Text>
        <RNText
          selectable
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: "right",
            fontSize: 12,
            lineHeight: 16,
            color: theme.color.val,
          }}
        >
          {value}
        </RNText>
        <CopyLink
          value={value}
          aria-label={t("paymentDetail.copy", { label })}
          copied={t("paymentDetail.copied")}
          failed={t("paymentDetail.copyError")}
        />
      </XStack>
    )
  }

  const content =
    children ??
    (value === undefined ? null : (
      <Text
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
        fontWeight={weight}
        text={stacked ? undefined : "right"}
      >
        {value}
      </Text>
    ))
  return stacked ? (
    <View gap={4}>
      <Text
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
        color="muted-foreground"
      >
        {label}
      </Text>
      {content}
    </View>
  ) : (
    <XStack justify="space-between" items="flex-start" gap={16}>
      <Text
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
        color="muted-foreground"
      >
        {label}
      </Text>
      <View maxW={224} shrink={1} items="flex-end">
        {content}
      </View>
    </XStack>
  )
}
