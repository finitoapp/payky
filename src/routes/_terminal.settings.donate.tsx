import { createRun } from "@evolu/web"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { HeartHandshakeIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"

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
import { createFetchDep } from "@/core/deps.ts"
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
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const SATS_PER_BTC = 100_000_000
const DEFAULT_DONATE_LUD16_ADDRESS = "donate@payky.me"

const DonationAmountSchema = z.number().int().positive().safe()

type EditedAmount = "fiat" | "sats"

export const Route = createFileRoute("/_terminal/settings/donate")({
  component: DonatePage,
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

function DonatePage() {
  const console = useConsole()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const currency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const donationAddress = getDonationAddress()
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [metadata, setMetadata] = useState<LnurlPayMetadata | null>(null)
  const [fiatInput, setFiatInput] = useState("")
  const [satsInput, setSatsInput] = useState("")
  const [editedAmount, setEditedAmount] = useState<EditedAmount>("fiat")
  const [isLoadingRate, setIsLoadingRate] = useState(true)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true)
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)
  const [loadErrorKey, setLoadErrorKey] = useState<TranslationKey | null>(null)
  const [invoiceErrorKey, setInvoiceErrorKey] = useState<TranslationKey | null>(
    null
  )

  useEffect(() => {
    let active = true

    const loadExchangeRate = async () => {
      setIsLoadingRate(true)
      setLoadErrorKey(null)

      try {
        await using run = createRun(createFetchDep())
        const result = await run(fetchYadioBtcExchangeRate(currency))

        if (!active) return

        if (!result.ok) {
          console.error("Failed to load donation exchange rate", result.error)
          setLoadErrorKey("settings.donate.rate.error")
          setExchangeRate(null)
          return
        }

        setExchangeRate(result.value.exchangeRate)
      } finally {
        if (active) setIsLoadingRate(false)
      }
    }

    void loadExchangeRate()

    return () => {
      active = false
    }
  }, [console, currency])

  useEffect(() => {
    let active = true

    const loadMetadata = async () => {
      setIsLoadingMetadata(true)
      setLoadErrorKey(null)

      try {
        await using run = createRun(createFetchDep())
        const nextMetadata = await run(
          fetchLnurlPayMetadata({ address: donationAddress })
        )

        if (!active) return

        if (!nextMetadata.ok) {
          console.error(
            "Failed to load donation LNURL metadata",
            nextMetadata.error
          )
          setMetadata(null)
          setLoadErrorKey("settings.donate.metadata.error")
          return
        }

        setMetadata(nextMetadata.value)
      } catch (error) {
        if (!active) return

        console.error("Failed to load donation LNURL metadata", error)
        setMetadata(null)
        setLoadErrorKey("settings.donate.metadata.error")
      } finally {
        if (active) setIsLoadingMetadata(false)
      }
    }

    void loadMetadata()

    return () => {
      active = false
    }
  }, [console, donationAddress])

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
    metadata !== null &&
    exchangeRate !== null &&
    !isCreatingInvoice
  const isLoading = isLoadingRate || isLoadingMetadata

  const createInvoice = async () => {
    if (!canCreateInvoice || metadata === null || amountSats === null) return

    setInvoiceErrorKey(null)
    setIsCreatingInvoice(true)

    try {
      await using run = createRun(createFetchDep())
      const nextInvoice = await run(
        fetchLnurlPayInvoice({ amountSats, metadata })
      )

      if (!nextInvoice.ok) {
        console.error("Failed to create donation invoice", nextInvoice.error)
        setInvoiceErrorKey("settings.donate.invoice.error")
        return
      }

      await navigate({
        to: "/settings/donate-invoice",
        search: {
          invoice: nextInvoice.value.pr,
          verify: nextInvoice.value.verify ?? "",
        },
      })
    } catch (error) {
      console.error("Failed to create donation invoice", error)
      setInvoiceErrorKey("settings.donate.invoice.error")
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.donate.title")} />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.donate.form.title")}</CardTitle>
            <CardDescription>
              {t("settings.donate.form.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field
                data-invalid={visibleAmountErrorKey !== null}
                className="gap-2"
              >
                <FieldLabel htmlFor="donation-fiat">
                  {t("settings.donate.fiat.label")}
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
                  {t("settings.donate.fiat.description")}
                </FieldDescription>
              </Field>

              <Field data-invalid={visibleAmountErrorKey !== null}>
                <FieldLabel htmlFor="donation-sats">
                  {t("settings.donate.sats.label")}
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
                    ? t("settings.donate.sats.description")
                    : t("settings.donate.sats.range")
                        .replace("{min}", String(metadata.minSendableSats))
                        .replace("{max}", String(metadata.maxSendableSats))}
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
                onClick={() => void createInvoice()}
                className="h-11"
              >
                {isLoading || isCreatingInvoice ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <HeartHandshakeIcon />
                )}
                {isCreatingInvoice
                  ? t("settings.donate.create.pending")
                  : t("settings.donate.create")}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </>
  )
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
  if (satsInput.trim().length === 0) return "settings.donate.amount.required"
  if (amountSats === null) return "settings.donate.amount.invalid"

  if (
    metadata !== null &&
    (amountSats < metadata.minSendableSats ||
      amountSats > metadata.maxSendableSats)
  ) {
    return "settings.donate.amount.range"
  }

  return null
}
