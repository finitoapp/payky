import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  saveCardSwitchioAccount,
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
import type { LucideIcon } from "lucide-react-native"
import Banknote from "lucide-react-native/icons/banknote"
import ChevronDown from "lucide-react-native/icons/chevron-down"
import ChevronRight from "lucide-react-native/icons/chevron-right"
import ChevronUp from "lucide-react-native/icons/chevron-up"
import Coins from "lucide-react-native/icons/coins"
import CreditCard from "lucide-react-native/icons/credit-card"
import Landmark from "lucide-react-native/icons/landmark"
import Zap from "lucide-react-native/icons/zap"
import { Pressable, Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Icon } from "../../../components/ui/icon.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useCashuRunToast, useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import {
  isSwitchioInstalled,
  isSwitchioSupported,
} from "../../../platform/switchio.ts"

interface PaymentMethodRowState {
  readonly icon: LucideIcon
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
 * available one is the tab the payment screen opens on.
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
      icon: Landmark,
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
      icon: Zap,
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
      icon: Banknote,
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
      icon: CreditCard,
      title: "settings.paymentAccounts.method.cardSwitchio",
      switchLabel: "settings.cardSwitchioAccount.enabled.label",
      enabled: cardEnabled,
      // The terminal is driven through Android intents, which needs the module.
      available:
        isSwitchioSupported() && cardEnabled && card.currency === appCurrency,
      canEnable: true,
      status: !isSwitchioSupported()
        ? t("settings.cardSwitchioAccount.nativeRuntimeWarning")
        : !isSwitchioInstalled()
          ? t("settings.cardSwitchioAccount.notInstalledWarning")
          : cardEnabled
            ? currencyMismatch(card.currency)
            : null,
      href: "/settings/payment-accounts/card-switchio",
      saveEnabled: (enabled) =>
        runToast(async (run) => {
          await run.ok(
            saveCardSwitchioAccount({ enabled, currency: appCurrency })
          )
        }),
    },
    cashu: {
      icon: Coins,
      title: "settings.paymentAccounts.method.cashu",
      switchLabel: "settings.cashuAccount.enabled.label",
      enabled: cashuEnabled,
      available: cashuEnabled,
      canEnable: true,
      status: null,
      // Like web, the account page appears once its row has been created.
      href: cashu === undefined ? null : "/settings/payment-accounts/cashu",
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
      <FadeHeader title={t("settings.paymentAccounts.title")} />
      <Text color="muted-foreground">
        {t("settings.paymentAccounts.order.description")}
      </Text>
      <YStack rounded="md" borderWidth={1} borderColor="border-color">
        {order.map((method, index) => (
          <PaymentMethodRow
            key={method}
            row={rows[method]}
            isDefault={method === firstAvailable}
            isFirst={index === 0}
            canMoveUp={index > 0}
            canMoveDown={index < order.length - 1}
            onMove={(offset) => move(index, offset)}
          />
        ))}
      </YStack>
    </Screen>
  )
}

function PaymentMethodRow({
  row,
  isDefault,
  isFirst,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  readonly row: PaymentMethodRowState
  readonly isDefault: boolean
  readonly isFirst: boolean
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

  return (
    <XStack
      items="center"
      gap="1"
      px="1"
      py="2"
      borderTopWidth={isFirst ? 0 : 1}
      borderColor="border-color"
    >
      <YStack>
        <MoveButton
          icon={ChevronUp}
          label={t("settings.paymentAccounts.moveUp.aria", { name })}
          disabled={!canMoveUp}
          onPress={() => onMove(-1)}
        />
        <MoveButton
          icon={ChevronDown}
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
        <XStack items="center" gap="3" py="1">
          <Icon icon={row.icon} color="muted-foreground" size={20} />
          <YStack flex={1} gap="1">
            <XStack items="center" gap="2">
              <Text
                fontWeight="600"
                flexShrink={1}
                color={row.enabled ? undefined : "muted-foreground"}
              >
                {name}
              </Text>
              {isDefault ? (
                <Badge
                  variant="secondary"
                  label={t("settings.paymentAccounts.default")}
                />
              ) : null}
              {row.experimental ? (
                <Badge
                  bg="warning-10"
                  labelColor="warning"
                  label={t("settings.paymentAccounts.experimental")}
                />
              ) : null}
            </XStack>
            {row.status === null ? null : (
              <Text fontSize={13} color="muted-foreground">
                {row.status}
              </Text>
            )}
          </YStack>
        </XStack>
      </Pressable>
      {href === null ? null : (
        <Icon icon={ChevronRight} color="muted-foreground" />
      )}
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
  icon,
  label,
  disabled,
  onPress,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon icon={icon} size={24} color="color" />
    </Button>
  )
}
