import { formatSatsAmount } from "@payky/app-shared/format-money"
import { withdrawalStatusKey } from "@payky/app-shared/withdraw-display"
import type { WithdrawalView } from "@payky/core/modules/withdraw/withdraw-queries"
import { type ReactNode, useState } from "react"
import { Pressable, Text as RNText } from "react-native"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { CopyLink } from "../../components/copy-link.tsx"
import { useBtcFiat } from "../../hooks/use-btc-fiat.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

/** The building blocks of the withdrawal screens. */

export function Card({ children }: { readonly children: ReactNode }) {
  return (
    <YStack
      gap="3"
      p="3"
      rounded="xl"
      borderWidth={1}
      borderColor="border-color"
      bg="card"
    >
      {children}
    </YStack>
  )
}

/** A labeled row; `stacked` puts a long value under its label. */
export function Row({
  label,
  children,
  stacked = false,
  emphasize = false,
}: {
  readonly label: string
  readonly children: ReactNode
  readonly stacked?: boolean
  readonly emphasize?: boolean
}) {
  const Layout = stacked ? YStack : XStack
  return (
    <Layout
      gap={stacked ? "1" : "3"}
      {...(stacked ? {} : { justify: "space-between" as const })}
    >
      <Text color="muted-foreground">{label}</Text>
      <YStack
        {...(stacked ? {} : { flex: 1, items: "flex-end" as const })}
        gap="0.5"
      >
        {typeof children === "string" ? (
          <Text fontWeight={emphasize ? "600" : "400"}>{children}</Text>
        ) : (
          children
        )}
      </YStack>
    </Layout>
  )
}

/** An identifier the owner may need to copy: selectable, with a Copy link. */
export function Mono({ value }: { readonly value: string }) {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <XStack gap="3" items="center" justify="space-between">
      <RNText
        selectable
        style={{ flex: 1, fontSize: 12, color: theme.color.val }}
      >
        {value}
      </RNText>
      <CopyLink
        value={value}
        accessibilityLabel={t("withdraw.detail.copy")}
        copied={t("withdraw.detail.copied")}
        failed={t("withdraw.detail.copyError")}
      />
    </XStack>
  )
}

/** The amount in sats, with its fiat equivalent when a rate is known. */
export function SatsWithFiat({ sats }: { readonly sats: number }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const approx = useBtcFiat().approx(sats)
  return (
    <YStack items="flex-end">
      <Text>
        {t("withdraw.sats", { amount: formatSatsAmount(sats, locale) })}
      </Text>
      {approx === null ? null : (
        <Text fontSize={12} color="muted-foreground">
          {approx}
        </Text>
      )}
    </YStack>
  )
}

/** `name@` plain and the domain emphasized: only TLS to that domain vouches for the recipient (withdraw/0005). */
export function LightningAddress({ address }: { readonly address: string }) {
  const at = address.lastIndexOf("@")
  return (
    <Text>
      {address.slice(0, at + 1)}
      <Text fontWeight="700">{address.slice(at + 1)}</Text>
    </Text>
  )
}

const statusColors = {
  done: "green-600",
  failed: "red-600",
  pending: "orange-600",
} as const satisfies Record<WithdrawalView["state"]["status"], string>

/** The state in words, coloured as well so it reads at a glance. */
export function WithdrawalStatusBadge({
  view,
}: {
  readonly view: WithdrawalView
}) {
  const { t } = useTranslation()
  const color = statusColors[view.state.status]
  return (
    <Text
      fontSize={12}
      fontWeight="600"
      color={color}
      borderWidth={1}
      borderColor={color}
      rounded="sm"
      px="2"
      py="0.5"
    >
      {t(withdrawalStatusKey(view))}
    </Text>
  )
}

/** A closed-by-default section for what most merchants never need to read. */
export function Collapsible({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <YStack gap="2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
      >
        <Text fontSize={13} fontWeight="600" color="muted-foreground">
          {`${label} ${open ? "▴" : "▾"}`}
        </Text>
      </Pressable>
      {open ? <YStack gap="2">{children}</YStack> : null}
    </YStack>
  )
}
