import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { HeartHandshakeIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"

import { DonationHistory } from "@/components/donation-history.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  fetchLnurlPayInvoice,
  fetchLnurlPayMetadata,
  type LnurlPayMetadata,
} from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import { fetchYadioBtcExchangeRate } from "@/core/integrations/yadio/yadio-client.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { currencyFractionDigits } from "@/core/modules/shared/money.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const SATS_PER_BTC = 100_000_000
const DEFAULT_DONATE_LUD16_ADDRESS = "donate@payky.me"

const DonationAmountSchema = z.number().int().positive().safe()

type EditedAmount = "fiat" | "sats"

type DonationLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly key: TranslationKey }
  | {
      readonly status: "ready"
      readonly exchangeRate: number
      readonly metadata: LnurlPayMetadata
    }

export const Route = createFileRoute("/_terminal/settings/donations")({
  component: DonationsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

const parseDecimalInput = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".")
  if (normalized.length === 0) return null

  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

const parseSatsInput = (value: string): number | null => {
  const amount = Number(value.trim())
  const parsed = DonationAmountSchema.safeParse(amount)

  return parsed.success ? parsed.data : null
}

const convertFiatToSats = (fiatAmount: number, exchangeRate: number): number =>
  Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))

const convertSatsToFiat = (sats: number, exchangeRate: number): number =>
  (sats / SATS_PER_BTC) * exchangeRate

const formatFiatInput = (
  fiatAmount: number,
  currency: FiatCurrencyType
): string => {
  const fractionDigits = currencyFractionDigits[currency]

  return fiatAmount.toFixed(fractionDigits).replace(/\.?0+$/u, "")
}

const getDonationAddress = (): string =>
  import.meta.env.VITE_PAYKY_DONATE_LUD16_ADDRESS ??
  DEFAULT_DONATE_LUD16_ADDRESS

function DonationsPage() {
  const console = useConsole()
  const appRun = useAppRun()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const currency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const donationAddress = getDonationAddress()
  const [fiatInput, setFiatInput] = useState("")
  const [satsInput, setSatsInput] = useState("")
  const [editedAmount, setEditedAmount] = useState<EditedAmount>("fiat")

  const exchangeRateQuery = useQuery({
    queryKey: ["donations", "exchange-rate", currency],
    queryFn: async () => {
      await using run = appRun()

      const result = await run(fetchYadioBtcExchangeRate(currency))

      if (!result.ok) {
        console.error("Failed to load donation exchange rate", result.error)
        throw result.error
      }

      return result.value
    },
  })
  const metadataQuery = useQuery({
    queryKey: ["donations", "lnurl-metadata", donationAddress],
    queryFn: async () => {
      await using run = appRun()

      const result = await run(
        fetchLnurlPayMetadata({ address: donationAddress })
      )

      if (!result.ok) {
        console.error("Failed to load donation LNURL metadata", result.error)
        throw result.error
      }

      return result.value
    },
  })
  const donationLoadState: DonationLoadState = exchangeRateQuery.isError
    ? { status: "error", key: "settings.donations.rate.error" }
    : metadataQuery.isError
      ? { status: "error", key: "settings.donations.metadata.error" }
      : exchangeRateQuery.data !== undefined && metadataQuery.data !== undefined
        ? {
            status: "ready",
            exchangeRate: exchangeRateQuery.data.exchangeRate,
            metadata: metadataQuery.data,
          }
        : { status: "loading" }
  const { exchangeRate, metadata, loadErrorKey, isLoading } =
    getDonationView(donationLoadState)

  const createInvoiceMutation = useMutation({
    mutationFn: async ({
      amountSats,
      metadata: invoiceMetadata,
    }: {
      readonly amountSats: number
      readonly metadata: LnurlPayMetadata
    }) => {
      await using run = appRun()

      const result = await run(
        fetchLnurlPayInvoice({ amountSats, metadata: invoiceMetadata })
      )

      if (!result.ok) {
        console.error("Failed to create donation invoice", result.error)
        throw result.error
      }

      await navigate({
        to: "/settings/donations-invoice",
        search: {
          invoice: result.value.pr,
          verify: result.value.verify ?? "",
        },
      })
    },
  })
  const isCreatingInvoice = createInvoiceMutation.isPending
  const invoiceErrorKey: TranslationKey | null = createInvoiceMutation.isError
    ? "settings.donations.invoice.error"
    : null

  useEffect(() => {
    if (exchangeRate === null) return

    if (editedAmount === "fiat") {
      const fiatAmount = parseDecimalInput(fiatInput)
      if (fiatAmount === null) {
        setSatsInput("")
        return
      }

      setSatsInput(String(convertFiatToSats(fiatAmount, exchangeRate)))
      return
    }

    const satsAmount = parseSatsInput(satsInput)
    if (satsAmount === null) {
      setFiatInput("")
      return
    }

    setFiatInput(
      formatFiatInput(convertSatsToFiat(satsAmount, exchangeRate), currency)
    )
  }, [currency, editedAmount, exchangeRate, fiatInput, satsInput])

  const amountSats = parseSatsInput(satsInput)
  const amountErrorKey = getAmountErrorKey({ amountSats, metadata, satsInput })
  const shouldShowAmountError =
    fiatInput.trim().length > 0 || satsInput.trim().length > 0
  const visibleAmountErrorKey = shouldShowAmountError ? amountErrorKey : null
  const canCreateInvoice =
    amountSats !== null &&
    amountErrorKey === null &&
    donationLoadState.status === "ready" &&
    !isCreatingInvoice

  const createInvoice = () => {
    if (donationLoadState.status !== "ready") return
    if (!canCreateInvoice || amountSats === null) return

    createInvoiceMutation.mutate({
      amountSats,
      metadata: donationLoadState.metadata,
    })
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.donations.title")} />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.donations.form.title")}</CardTitle>
            <CardDescription>
              {t("settings.donations.form.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field
                data-invalid={visibleAmountErrorKey !== null}
                className="gap-2"
              >
                <FieldLabel htmlFor="donation-fiat">
                  {t("settings.donations.fiat.label")}
                </FieldLabel>
                <Input
                  id="donation-fiat"
                  inputMode="decimal"
                  value={fiatInput}
                  aria-invalid={visibleAmountErrorKey !== null}
                  onChange={(event) => {
                    setEditedAmount("fiat")
                    setFiatInput(event.target.value)
                  }}
                />
                <FieldDescription>
                  {t("settings.donations.fiat.description")}
                </FieldDescription>
              </Field>

              <Field data-invalid={visibleAmountErrorKey !== null}>
                <FieldLabel htmlFor="donation-sats">
                  {t("settings.donations.sats.label")}
                </FieldLabel>
                <Input
                  id="donation-sats"
                  inputMode="numeric"
                  value={satsInput}
                  aria-invalid={visibleAmountErrorKey !== null}
                  onChange={(event) => {
                    setEditedAmount("sats")
                    setSatsInput(event.target.value)
                  }}
                />
                <FieldDescription>
                  {metadata === null
                    ? t("settings.donations.sats.description")
                    : t("settings.donations.sats.range", {
                        min: metadata.minSendableSats,
                        max: metadata.maxSendableSats,
                      })}
                </FieldDescription>
                {visibleAmountErrorKey !== null ? (
                  <FieldError>{t(visibleAmountErrorKey)}</FieldError>
                ) : null}
              </Field>

              {loadErrorKey !== null ? (
                <p className="text-sm font-medium text-destructive">
                  {t(loadErrorKey)}
                </p>
              ) : null}
              {invoiceErrorKey !== null ? (
                <p className="text-sm font-medium text-destructive">
                  {t(invoiceErrorKey)}
                </p>
              ) : null}

              <Button
                type="button"
                size="lg"
                disabled={!canCreateInvoice || isLoading}
                onClick={createInvoice}
                className="h-11"
              >
                {isLoading || isCreatingInvoice ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <HeartHandshakeIcon />
                )}
                {isCreatingInvoice
                  ? t("settings.donations.create.pending")
                  : t("settings.donations.create")}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <DonationHistory />
      </div>
    </>
  )
}

/**
 * Maps `DonationLoadState` to its rendered fields through an exhaustive
 * switch (explicit return type), so adding a new status variant without
 * handling it here is a compile error - the single place these fields can
 * derive from the union stays in sync with it.
 */
function getDonationView(state: DonationLoadState): {
  readonly exchangeRate: number | null
  readonly metadata: LnurlPayMetadata | null
  readonly loadErrorKey: TranslationKey | null
  readonly isLoading: boolean
} {
  switch (state.status) {
    case "loading":
      return {
        exchangeRate: null,
        metadata: null,
        loadErrorKey: null,
        isLoading: true,
      }
    case "error":
      return {
        exchangeRate: null,
        metadata: null,
        loadErrorKey: state.key,
        isLoading: false,
      }
    case "ready":
      return {
        exchangeRate: state.exchangeRate,
        metadata: state.metadata,
        loadErrorKey: null,
        isLoading: false,
      }
  }
}

function getAmountErrorKey({
  amountSats,
  metadata,
  satsInput,
}: {
  readonly amountSats: number | null
  readonly metadata: LnurlPayMetadata | null
  readonly satsInput: string
}): TranslationKey | null {
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
