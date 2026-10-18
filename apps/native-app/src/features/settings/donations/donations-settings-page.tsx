import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  fetchLnurlPayInvoice,
  type LnurlPayMetadata,
} from "@payky/core/integrations/lnurl/lnurl-pay-client"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import {
  currencyFractionDigits,
  decimalAmountToMinorUnits,
  fiatMinorUnitsToSats,
  minorUnitsToDecimalString,
  satsToFiat,
} from "@payky/core/modules/shared/money"
import {
  type FiatCurrency as FiatCurrencyType,
  Integer,
} from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Text, YStack } from "tamagui"
import { z } from "zod"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { nativeEnv } from "../../../core/native-env.ts"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useBtcFiat, useLnurlPayMetadata } from "../../../hooks/use-btc-fiat.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { DonationHistory } from "./donation-history.tsx"

const DonationAmountSchema = z.number().int().positive().safe()

type EditedAmount = "fiat" | "sats"

const parseSatsInput = (value: string): number | null => {
  const parsed = DonationAmountSchema.safeParse(Number(value.trim()))
  return parsed.success ? parsed.data : null
}

const formatFiatInput = (
  fiatAmount: number,
  currency: FiatCurrencyType
): string =>
  minorUnitsToDecimalString({
    value: Integer(
      Math.round(fiatAmount * 10 ** currencyFractionDigits[currency])
    ),
    currency,
  })

const getAmountErrorKey = ({
  amountSats,
  metadata,
  satsInput,
}: {
  readonly amountSats: number | null
  readonly metadata: LnurlPayMetadata | null
  readonly satsInput: string
}): TranslationKey | null => {
  if (satsInput.trim().length === 0) return "settings.donations.amount.required"
  if (amountSats === null) return "settings.donations.amount.invalid"
  if (
    metadata !== null &&
    (amountSats < metadata.minSendableSats ||
      amountSats > metadata.maxSendableSats)
  ) {
    return "settings.donations.amount.range"
  }
  return null
}

/**
 * Donation amount (A04): type fiat or sats, the other follows the BTC rate,
 * then create a Lightning invoice against the donation address. The server
 * wallet and its keys stay behind the app's own `/api/lnurlp/donate`.
 */
export function DonationsSettingsPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const currency = getFiatCurrency(settings)
  const { rate: exchangeRate } = useBtcFiat()
  const metadataState = useLnurlPayMetadata(
    nativeEnv.EXPO_PUBLIC_PAYKY_DONATE_LUD16_ADDRESS
  )
  const metadata = metadataState.data
  const [fiatInput, setFiatInput] = useState("")
  const [satsInput, setSatsInput] = useState("")
  const [editedAmount, setEditedAmount] = useState<EditedAmount>("fiat")
  const [creating, setCreating] = useState(false)
  const [invoiceFailed, setInvoiceFailed] = useState(false)

  const loadErrorKey: TranslationKey | null =
    exchangeRate === null && !metadataState.loading && metadataState.failed
      ? "settings.donations.metadata.error"
      : null
  const isLoading = exchangeRate === null || metadata === null

  useEffect(() => {
    if (exchangeRate === null) return
    if (editedAmount === "fiat") {
      const amount = decimalAmountToMinorUnits({ currency, value: fiatInput })
      setSatsInput(
        amount === null
          ? ""
          : String(fiatMinorUnitsToSats({ amount, exchangeRate, currency }))
      )
      return
    }
    const satsAmount = parseSatsInput(satsInput)
    setFiatInput(
      satsAmount === null
        ? ""
        : formatFiatInput(
            satsToFiat({ sats: satsAmount, exchangeRate }),
            currency
          )
    )
  }, [currency, editedAmount, exchangeRate, fiatInput, satsInput])

  const amountSats = parseSatsInput(satsInput)
  const amountErrorKey = getAmountErrorKey({ amountSats, metadata, satsInput })
  const showAmountError =
    fiatInput.trim().length > 0 || satsInput.trim().length > 0
  const visibleAmountError = showAmountError ? amountErrorKey : null
  const canCreate =
    amountSats !== null &&
    amountErrorKey === null &&
    metadata !== null &&
    !creating

  const createInvoice = async () => {
    if (!canCreate || amountSats === null || metadata === null) return
    setCreating(true)
    setInvoiceFailed(false)
    try {
      await using run = appRun()
      const result = await run(fetchLnurlPayInvoice({ amountSats, metadata }))
      if (!result.ok) {
        setInvoiceFailed(true)
        return
      }
      router.push({
        pathname: "/settings/donations-invoice",
        params: { invoice: result.value.pr, verify: result.value.verify ?? "" },
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.donations.title")} />
      <YStack gap="1">
        <Text fontWeight="700">{t("settings.donations.form.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.donations.form.description")}
        </Text>
      </YStack>
      <Field
        label={t("settings.donations.fiat.label")}
        value={fiatInput}
        keyboardType="decimal-pad"
        onChangeText={(next) => {
          setEditedAmount("fiat")
          setFiatInput(next)
        }}
      />
      <Text fontSize={12} color="muted-foreground">
        {t("settings.donations.fiat.description")}
      </Text>
      <Field
        label={t("settings.donations.sats.label")}
        value={satsInput}
        keyboardType="number-pad"
        error={visibleAmountError === null ? undefined : t(visibleAmountError)}
        onChangeText={(next) => {
          setEditedAmount("sats")
          setSatsInput(next)
        }}
      />
      <Text fontSize={12} color="muted-foreground">
        {metadata === null
          ? t("settings.donations.sats.description")
          : t("settings.donations.sats.range", {
              min: metadata.minSendableSats,
              max: metadata.maxSendableSats,
            })}
      </Text>
      {loadErrorKey === null ? null : (
        <Text color="red-600" accessibilityRole="alert">
          {t(loadErrorKey)}
        </Text>
      )}
      {invoiceFailed ? (
        <Text color="red-600" accessibilityRole="alert">
          {t("settings.donations.invoice.error")}
        </Text>
      ) : null}
      <AppButton
        label={t(
          creating
            ? "settings.donations.create.pending"
            : "settings.donations.create"
        )}
        disabled={!canCreate || isLoading}
        pending={creating}
        onPress={() => {
          void createInvoice()
        }}
      />
      <DonationHistory />
    </Screen>
  )
}
