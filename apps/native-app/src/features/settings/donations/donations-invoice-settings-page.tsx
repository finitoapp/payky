import { fetchLnurlVerify } from "@payky/core/integrations/lnurl/lnurl-pay-client"
import { router, useLocalSearchParams } from "expo-router"
import { Linking } from "react-native"
import { Text, YStack } from "tamagui"
import { z } from "zod"
import { AppButton } from "../../../components/app-button.tsx"
import { QrCode } from "../../../components/qr-code.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useAsyncValue } from "../../../hooks/use-async-value.ts"
import { useCopyToClipboard } from "../../../hooks/use-copy-to-clipboard.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

const VERIFY_POLL_INTERVAL_MS = 2_000

// Falls back to "" (read as "nothing given") instead of throwing on a stale
// or hand-typed link; a verify URL must be an https URL.
const InvoiceParamsSchema = z.object({
  invoice: z.string().trim().min(1).catch(""),
  verify: z
    .string()
    .trim()
    .refine(
      (value) => z.url({ protocol: /^https$/u }).safeParse(value).success,
      "Expected a valid verify URL."
    )
    .catch(""),
})

/** The route: the invoice and its LNURL verify URL come from the amount page. */
export function DonationsInvoiceRoute() {
  const params = useLocalSearchParams<{ invoice?: string; verify?: string }>()
  const { invoice, verify } = InvoiceParamsSchema.parse({
    invoice: params.invoice ?? "",
    verify: params.verify ?? "",
  })
  return <DonationsInvoiceSettingsPage invoice={invoice} verify={verify} />
}

function DonationsInvoiceSettingsPage({
  invoice,
  verify,
}: {
  readonly invoice: string
  readonly verify: string
}) {
  const appRun = useAppRun()
  const copy = useCopyToClipboard()
  const { t } = useTranslation()
  const canVerify = invoice.length > 0 && verify.length > 0

  const verification = useAsyncValue(
    canVerify ? `donation-verify:${verify}` : null,
    async () => {
      await using run = appRun()
      const result = await run(fetchLnurlVerify({ verifyUrl: verify }))
      if (!result.ok) throw new Error("Failed to verify donation invoice")
      return result.value
    },
    {
      refetchMs: VERIFY_POLL_INTERVAL_MS,
      done: (data) => data.settled,
    }
  )
  const paid = verification.data?.settled === true

  if (paid) {
    return (
      <Screen>
        <ScreenHeader title={t("settings.donations.invoice.title")} />
        <YStack gap="3" accessibilityLiveRegion="polite">
          <Text fontSize={24} fontWeight="700">
            {t("settings.donations.invoice.verify.paid")}
          </Text>
          <Text color="muted-foreground">
            {t("settings.donations.invoice.verify.paid.description")}
          </Text>
        </YStack>
        <AppButton
          label={t("settings.donations.invoice.backToSettings")}
          onPress={() => router.dismissTo("/settings")}
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.donations.invoice.title")} />
      <Text color="muted-foreground">
        {invoice.length === 0
          ? t("settings.donations.invoice.missing")
          : t("settings.donations.invoice.description")}
      </Text>
      {invoice.length > 0 ? (
        <>
          <YStack items="center" accessibilityLabel={invoice}>
            <QrCode value={invoice} size={280} />
          </YStack>
          {canVerify ? (
            <Text
              color={verification.failed ? "red-600" : "muted-foreground"}
              accessibilityLiveRegion="polite"
            >
              {t(
                verification.failed
                  ? "settings.donations.invoice.verify.error"
                  : "settings.donations.invoice.verify.waiting"
              )}
            </Text>
          ) : null}
          <AppButton
            label={t("settings.donations.invoice.openWallet")}
            onPress={() => {
              void Linking.openURL(`lightning:${invoice}`)
            }}
          />
          <AppButton
            label={t("settings.donations.invoice.copy")}
            variant="secondary"
            onPress={() =>
              void copy(invoice, {
                copied: t("settings.donations.invoice.copied"),
                failed: t("settings.donations.invoice.copyFailed"),
              })
            }
          />
        </>
      ) : null}
    </Screen>
  )
}
