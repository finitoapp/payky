import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  saveCashRegisterAccount,
  saveCashuAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@payky/core/modules/account/account-actions"
import {
  cardSwitchioAccountQuery,
  cashRegisterAccountQuery,
  cashuAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@payky/core/modules/account/account-queries"
import { setPaymentMethodOrder } from "@payky/core/modules/app-settings/app-settings-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import type { DefaultPaymentMethod } from "@payky/core/modules/app-settings/app-settings-types"
import {
  getFiatCurrency,
  getPaymentMethodOrder,
} from "@payky/core/modules/app-settings/app-settings-utils"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { Pressable, Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useCashuRunToast, useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

interface PaymentMethodRowState {
  readonly title: TranslationKey
  readonly switchLabel: TranslationKey
  readonly enabled: boolean
  /** Enabled and offered on the payment screen for the app's currency. */
  readonly available: boolean
  readonly canEnable: boolean
  readonly status: string | null
  readonly href: string | null
  /**
   * Resolves `true` once stored; `null` for a method this app cannot set up
   * yet, which gets no switch rather than one that does nothing.
   */
  readonly saveEnabled: ((enabled: boolean) => Promise<boolean>) | null
  /** Still being proven: marked so the merchant knows before turning it on. */
  readonly experimental?: true
}

/**
 * The payment methods in the order customers see them, as web's
 * `PaymentAccountsSettingsPage`. There is no separate default: the first
 * available one is the tab the payment screen opens on. The payment card is
 * listed (and can be ordered) but not configurable here: its SwitchioPay
 * terminal has no native bridge yet.
 */
export function PaymentAccountsSettingsPage() {
  const runToast = useRunToast()
  const cashuRunToast = useCashuRunToast()
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const [bank] = useEvoluQuery(fiatBankAccountQuery).data
  const [spark] = useEvoluQuery(sparkAccountQuery).data
  const [cash] = useEvoluQuery(cashRegisterAccountQuery).data
  const [card] = useEvoluQuery(cardSwitchioAccountQuery).data
  const [cashu] = useEvoluQuery(cashuAccountQuery).data

  const appCurrency = getFiatCurrency(settings)
  const bankEnabled = bank !== undefined && bank.isDeleted !== 1
  const sparkEnabled = spark !== undefined && spark.isDeleted !== 1
  const cashEnabled = cash !== undefined && cash.isDeleted !== 1
  const cardEnabled = card !== undefined && card.isDeleted !== 1
  const cashuEnabled = cashu !== undefined && cashu.isDeleted !== 1

  const currencyMismatch = (currency: FiatCurrency | undefined) =>
    currency === undefined || currency === appCurrency
      ? null
      : t("settings.paymentAccounts.status.currencyMismatch", {
          currency,
          appCurrency,
        })

  const rows = {
    iban: {
      title: "settings.paymentAccounts.method.iban",
      switchLabel: "settings.fiatBankAccount.enabled.label",
      enabled: bankEnabled,
      available: bankEnabled && bank.currency === appCurrency,
      // An account row only exists once an IBAN was entered, and enabling
      // without one would offer bank transfer with nowhere to send it.
      canEnable: bank !== undefined,
      status:
        bank === undefined
          ? t("settings.paymentAccounts.status.missingIban")
          : bankEnabled
            ? currencyMismatch(bank.currency)
            : null,
      href: "/settings/payment-accounts/iban",
      saveEnabled: (enabled) =>
        runToast(async (run) => {
          if (bank === undefined) return
          await run.ok(
            saveFiatBankAccount({
              enabled,
              iban: bank.iban,
              currency: bank.currency,
              defaultQrFormat: bank.defaultQrFormat ?? "spayd",
            })
          )
        }),
    },
    spark: {
      title: "settings.paymentAccounts.method.spark",
      switchLabel: "settings.sparkAccount.enabled.label",
      enabled: sparkEnabled,
      available: sparkEnabled,
      canEnable: true,
      status: null,
      // Before the first enable there is no wallet yet to show or change.
      href: spark === undefined ? null : "/settings/payment-accounts/spark",
      saveEnabled: (enabled) =>
        runToast(async (run) => {
          await run.ok(saveSparkAccount({ enabled }))
        }),
    },
    cashRegister: {
      title: "settings.paymentAccounts.method.cashRegister",
      switchLabel: "settings.cashRegisterAccount.enabled.label",
      enabled: cashEnabled,
      available: cashEnabled && cash.currency === appCurrency,
      canEnable: true,
      status: cashEnabled ? currencyMismatch(cash.currency) : null,
      href: null,
      saveEnabled: (enabled) =>
        runToast(async (run) => {
          await run.ok(
            saveCashRegisterAccount({ enabled, currency: appCurrency })
          )
        }),
    },
    cardSwitchio: {
      title: "settings.paymentAccounts.method.cardSwitchio",
      switchLabel: "settings.cardSwitchioAccount.enabled.label",
      enabled: cardEnabled,
      // The terminal cannot be driven from this app, so the tab is not offered.
      available: false,
      canEnable: false,
      status: t("settings.paymentAccounts.status.unavailableHere"),
      href: null,
      saveEnabled: null,
    },
    cashu: {
      title: "settings.paymentAccounts.method.cashu",
      switchLabel: "settings.cashuAccount.enabled.label",
      enabled: cashuEnabled,
      available: cashuEnabled,
      canEnable: true,
      status: null,
      // Its own screens are not here yet.
      href: null,
      experimental: true,
      saveEnabled: (enabled) =>
        cashuRunToast(async (run) => {
          await run.ok(saveCashuAccount({ enabled }))
        }),
    },
  } satisfies Record<DefaultPaymentMethod, PaymentMethodRowState>

  const order = getPaymentMethodOrder(settings)
  const firstAvailable = order.find((method) => rows[method].available)

  const move = (index: number, offset: -1 | 1) => {
    const method = order[index]
    const neighbour = order[index + offset]
    if (method === undefined || neighbour === undefined) return

    const nextOrder = order.with(index, neighbour).with(index + offset, method)
    void runToast(async (run) => {
      await run.ok(setPaymentMethodOrder(nextOrder))
    })
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.paymentAccounts.title")} />
      <Text color="muted-foreground">
        {t("settings.paymentAccounts.order.description")}
      </Text>
      {order.map((method, index) => (
        <PaymentMethodRow
          key={method}
          row={rows[method]}
          isDefault={method === firstAvailable}
          canMoveUp={index > 0}
          canMoveDown={index < order.length - 1}
          onMove={(offset) => move(index, offset)}
        />
      ))}
    </Screen>
  )
}

function PaymentMethodRow({
  row,
  isDefault,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  readonly row: PaymentMethodRowState
  readonly isDefault: boolean
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
  readonly onMove: (offset: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const name = t(row.title)
  const choice = useInlineChoice(
    row.enabled,
    row.saveEnabled ?? (async () => false)
  )
  const { href } = row

  const badges = [
    isDefault ? t("settings.paymentAccounts.default") : null,
    row.experimental ? t("settings.paymentAccounts.experimental") : null,
  ].filter((badge) => badge !== null)

  return (
    <XStack
      items="center"
      gap="2"
      px="2"
      py="1"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <YStack>
        <MoveButton
          glyph="▲"
          label={t("settings.paymentAccounts.moveUp.aria", { name })}
          disabled={!canMoveUp}
          onPress={() => onMove(-1)}
        />
        <MoveButton
          glyph="▼"
          label={t("settings.paymentAccounts.moveDown.aria", { name })}
          disabled={!canMoveDown}
          onPress={() => onMove(1)}
        />
      </YStack>
      <Pressable
        accessibilityRole={href === null ? undefined : "button"}
        accessibilityLabel={name}
        disabled={href === null}
        style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
        onPress={() => {
          if (href !== null) router.push(href)
        }}
      >
        <Text
          fontWeight="600"
          color={row.enabled ? undefined : "muted-foreground"}
        >
          {badges.length === 0 ? name : `${name} · ${badges.join(" · ")}`}
        </Text>
        {row.status === null ? null : (
          <Text fontSize={13} color="muted-foreground">
            {row.status}
          </Text>
        )}
      </Pressable>
      {href === null ? null : <Text color="muted-foreground">›</Text>}
      {row.saveEnabled === null ? null : (
        <Switch
          accessibilityLabel={t(row.switchLabel)}
          value={choice.value}
          disabled={!row.canEnable || choice.saving}
          onValueChange={(next) => {
            void choice.choose(next)
          }}
        />
      )}
    </XStack>
  )
}

function MoveButton({
  glyph,
  label,
  disabled,
  onPress,
}: {
  readonly glyph: string
  readonly label: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      style={{
        minWidth: 44,
        minHeight: 36,
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={onPress}
    >
      <Text fontSize={16} color={disabled ? "muted-foreground" : undefined}>
        {glyph}
      </Text>
    </Pressable>
  )
}
