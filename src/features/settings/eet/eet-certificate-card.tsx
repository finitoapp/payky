import { sqliteTrue } from "@evolu/common"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon, UploadIcon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"
import { Badge } from "@/components/ui/badge.tsx"
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
  type EetCertificateError,
  type EetCertificateFile,
  readEetCertificateFile,
} from "@/core/integrations/eet/eet-certificate.ts"
import { fetchPlaygroundCertificates } from "@/core/integrations/eet/playground-certificates-client.ts"
import { storeEetCertificate } from "@/core/modules/eet/eet-actions.ts"
import type { EetEnvironment } from "@/core/modules/eet/eet-types.ts"
import { deriveEetCertificateExpiry } from "@/core/modules/eet/eet-utils.ts"
import { useEetSettings } from "@/features/shared/use-eet-settings.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDate } from "@/lib/format-utils.ts"

const certificateErrorKeys = {
  EetCertificateUnreadableError: "settings.eet.certificate.error.unreadable",
  EetCertificateWrongPasswordError:
    "settings.eet.certificate.error.wrongPassword",
  EetCertificateWithoutKeyError: "settings.eet.certificate.error.withoutKey",
  EetCertificateWithoutEicError: "settings.eet.certificate.error.withoutEic",
  EetCertificateExpiredError: "settings.eet.certificate.error.expired",
  EetCertificateNotYetValidError: "settings.eet.certificate.error.notYetValid",
} satisfies Record<EetCertificateError["type"], TranslationKey>

export function EetCertificateCard({
  environment,
}: {
  readonly environment: EetEnvironment
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.eet.certificate.title")}</CardTitle>
        <CardDescription>
          {t("settings.eet.certificate.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <EetStoredCertificate />
        <EetCertificateFileImport />
        {environment === "playground" ? <EetOfficialTestCertificates /> : null}
      </CardContent>
    </Card>
  )
}

function EetStoredCertificate() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { settings } = useEetSettings()
  const validTo = settings?.validTo ?? null
  const now = useNow([validTo])

  if (
    settings?.eic === null ||
    settings?.eic === undefined ||
    validTo === null
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.eet.certificate.none")}
      </p>
    )
  }

  const expiry = deriveEetCertificateExpiry({ validTo: new Date(validTo), now })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("settings.eet.certificate.eic")}
          </span>
          <span
            className="font-mono text-sm font-semibold"
            data-testid="eet-certificate-eic"
          >
            {settings.eic}
          </span>
          {settings.description === null ? null : (
            <span className="text-xs text-muted-foreground">
              {settings.description}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {t("settings.eet.certificate.validTo", {
              date: formatDate(new Date(validTo), locale),
            })}
          </span>
        </span>
        {settings.isTestCertificate === sqliteTrue ? (
          <Badge variant="secondary" className="bg-info/10 text-info">
            {t("settings.eet.certificate.testBadge")}
          </Badge>
        ) : null}
      </div>
      {expiry === "valid" ? null : (
        <Alert variant={expiry === "expired" ? "destructive" : "warning"}>
          <TriangleAlertIcon />
          <AlertTitle>
            {t(
              expiry === "expired"
                ? "settings.eet.certificate.expired.title"
                : "settings.eet.certificate.expiresSoon.title"
            )}
          </AlertTitle>
          <AlertDescription>
            {t(
              expiry === "expired"
                ? "settings.eet.certificate.expired.description"
                : "settings.eet.certificate.expiresSoon.description"
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function EetCertificateFileImport() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const fileInputId = useId()
  const passwordInputId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const importCertificate = async () => {
    if (file === null) {
      setError("settings.eet.certificate.error.fileRequired")
      return
    }

    setPending(true)
    const certificate = await readEetCertificateFile({
      file: new Uint8Array(await file.arrayBuffer()),
      password,
      now: new Date(),
    })
    if (!certificate.ok) {
      setError(certificateErrorKeys[certificate.error.type])
      setPending(false)
      return
    }

    const saved = await runToast(async (run) => {
      await run.ok(
        storeEetCertificate({
          certificate: certificate.value,
          isTestCertificate: false,
        })
      )
    })
    setPending(false)
    if (!saved) return

    setFile(null)
    setFileInputKey((key) => key + 1)
    setPassword("")
    toast.success(t("settings.eet.certificate.imported"))
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void importCertificate()
      }}
    >
      <FieldGroup>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={fileInputId}>
            {t("settings.eet.certificate.file.label")}
          </FieldLabel>
          <Input
            key={fileInputKey}
            id={fileInputId}
            type="file"
            accept=".p12,.pfx,application/x-pkcs12"
            disabled={pending}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null)
              setError(null)
            }}
          />
          <FieldDescription>
            {t("settings.eet.certificate.file.description")}
          </FieldDescription>
        </Field>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={passwordInputId}>
            {t("settings.eet.certificate.password.label")}
          </FieldLabel>
          <Input
            id={passwordInputId}
            type="password"
            autoComplete="off"
            value={password}
            disabled={pending}
            onChange={(event) => {
              setPassword(event.currentTarget.value)
              setError(null)
            }}
          />
          <FieldError>{error === null ? null : t(error)}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending} className="self-end">
        <UploadIcon data-icon="inline-start" />
        {t("settings.eet.certificate.import")}
      </Button>
    </form>
  )
}

function EetOfficialTestCertificates() {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const runToast = useRunToast()
  const [requested, setRequested] = useState(false)
  const [storingEic, setStoringEic] = useState<string | null>(null)
  const certificatesQuery = useQuery({
    queryKey: ["eet", "playground-certificates"],
    enabled: requested,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchPlaygroundCertificates())
      if (!result.ok) throw result.error
      return result.value
    },
  })

  const storeOfficialCertificate = async (certificate: EetCertificateFile) => {
    setStoringEic(certificate.eic)
    const saved = await runToast(async (run) => {
      await run.ok(
        storeEetCertificate({ certificate, isTestCertificate: true })
      )
    })
    setStoringEic(null)
    if (saved) toast.success(t("settings.eet.certificate.imported"))
  }

  if (!requested) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
        <p className="text-sm text-muted-foreground">
          {t("settings.eet.officialTest.description")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setRequested(true)}
        >
          {t("settings.eet.officialTest.show")}
        </Button>
      </div>
    )
  }

  if (certificatesQuery.isError) {
    return (
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>
          {t("settings.eet.officialTest.unavailable.title")}
        </AlertTitle>
        <AlertDescription>
          {t("settings.eet.officialTest.unavailable.description")}
        </AlertDescription>
      </Alert>
    )
  }

  if (certificatesQuery.data === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.eet.officialTest.loading")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {t("settings.eet.officialTest.title")}
      </p>
      <ul className="flex flex-col gap-2">
        {certificatesQuery.data.map((certificate) => (
          <li
            key={certificate.eic}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-sm font-semibold">
                {certificate.eic}
              </span>
              {certificate.description === null ? null : (
                <span className="text-xs text-muted-foreground">
                  {certificate.description}
                </span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={storingEic !== null}
              aria-label={t("settings.eet.officialTest.use", {
                name: certificate.eic,
              })}
              onClick={() => void storeOfficialCertificate(certificate)}
            >
              {t("settings.eet.officialTest.useShort")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
