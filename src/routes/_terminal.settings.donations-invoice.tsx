import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"
import { z } from "zod"

import { CopyableQrCode } from "@/components/copyable-qr-code.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { SuccessPanel } from "@/components/success-panel.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { fetchLnurlVerify } from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const VERIFY_POLL_INTERVAL_MS = 2_000
const VERIFY_ERROR_THRESHOLD = 3

const DonateInvoiceSearchSchema = z.object({
  invoice: z.string().trim().min(1).optional().default(""),
  verify: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || z.url().safeParse(value).success,
      "Expected a valid verify URL."
    )
    .optional()
    .default(""),
})

type VerifyStatus = "idle" | "waiting" | "paid" | "error"

export const Route = createFileRoute("/_terminal/settings/donations-invoice")({
  component: DonateInvoicePage,
  validateSearch: (search) => DonateInvoiceSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function DonateInvoicePage() {
  const appRun = useAppRun()
  const console = useConsole()
  const { t } = useTranslation()
  const { invoice, verify } = Route.useSearch()
  const canVerify = invoice.length > 0 && verify.length > 0

  const verifyQuery = useQuery({
    queryKey: ["donations", "lnurl-verify", verify],
    queryFn: async () => {
      await using run = appRun()

      try {
        return await run.orThrow(fetchLnurlVerify({ verifyUrl: verify }))
      } catch (error) {
        console.error("Failed to verify donation invoice", error)
        throw error
      }
    },
    enabled: canVerify,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.settled ? false : VERIFY_POLL_INTERVAL_MS,
  })

  const verifyStatus: VerifyStatus = !canVerify
    ? "idle"
    : verifyQuery.data?.settled
      ? "paid"
      : verifyQuery.isError &&
          verifyQuery.failureCount >= VERIFY_ERROR_THRESHOLD
        ? "error"
        : "waiting"

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.donations.invoice.title")} />

      {verifyStatus === "paid" ? (
        <Card>
          <CardContent>
            <div className="flex min-h-[28rem] items-center justify-center">
              <SuccessPanel
                title={t("settings.donations.invoice.verify.paid")}
                actions={
                  <div className="flex w-full flex-col items-center gap-8 pt-10">
                    <p className="max-w-72 text-balance text-center text-muted-foreground">
                      {t("settings.donations.invoice.verify.paid.description")}
                    </p>
                    <Button
                      size="lg"
                      nativeButton={false}
                      render={<Link to="/settings" />}
                      className="h-14 w-80"
                    >
                      {t("settings.donations.invoice.backToSettings")}
                    </Button>
                  </div>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.donations.invoice.title")}</CardTitle>
            <CardDescription>
              {invoice.length === 0
                ? t("settings.donations.invoice.missing")
                : t("settings.donations.invoice.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoice.length > 0 ? (
              <div className="flex flex-col gap-4">
                <CopyableQrCode
                  state="ready"
                  value={invoice}
                  ariaLabel={t("settings.donations.invoice.copy")}
                  copiedMessage={t("settings.donations.invoice.copied")}
                  copyFailedMessage={t("settings.donations.invoice.copyFailed")}
                />

                <DonationVerifyStatus status={verifyStatus} />
              </div>
            ) : null}
          </CardContent>
          {invoice.length > 0 ? (
            <CardFooter>
              <Button
                nativeButton={false}
                render={<a href={`lightning:${invoice}`} />}
                className="w-full"
              >
                {t("settings.donations.invoice.openWallet")}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      )}
    </>
  )
}

function DonationVerifyStatus({ status }: { readonly status: VerifyStatus }) {
  const { t } = useTranslation()

  if (status === "waiting") {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <LoaderCircleIcon className="animate-spin" />
        <span>{t("settings.donations.invoice.verify.waiting")}</span>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center gap-2 text-destructive text-sm">
        <CircleAlertIcon />
        <span>{t("settings.donations.invoice.verify.error")}</span>
      </div>
    )
  }

  return null
}
