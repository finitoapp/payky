import { useAtomValue } from "jotai"
import { AlertTriangle, Database, Download, Smartphone } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx"
import { getNativeRuntime } from "@/core/native/runtime.ts"
import {
  createEvoluExportFilename,
  type EvoluExportDatabase,
  formatBytes,
  formatExportCreatedAt,
  type SavedEvoluExportFile,
  saveEvoluExportFile,
} from "@/features/settings/evolu-export/evolu-export-utils.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface ExportState {
  readonly createdAt: Date
  readonly files: ReadonlyArray<SavedEvoluExportFile>
}

type ExportOutcome =
  | { readonly status: "idle" }
  | { readonly status: "pending" }
  | { readonly status: "success"; readonly export: ExportState }
  | { readonly status: "error"; readonly message: string }

interface ExportSelection {
  readonly app: boolean
  readonly device: boolean
}

const databaseLabels = {
  app: "settings.evoluExport.database.app",
  device: "settings.evoluExport.database.device",
} satisfies Record<EvoluExportDatabase, TranslationKey>

export function EvoluExportPage() {
  const { t } = useTranslation()
  const appEvolu = useEvolu()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const [selection, setSelection] = useState<ExportSelection>({
    app: true,
    device: true,
  })
  const [acceptedWarning, setAcceptedWarning] = useState(false)
  const [outcome, setOutcome] = useState<ExportOutcome>({ status: "idle" })
  const runtime = getNativeRuntime()
  const selectedDatabases = getSelectedDatabases(selection)
  const canExport =
    acceptedWarning &&
    selectedDatabases.length > 0 &&
    outcome.status !== "pending"

  const handleExport = async () => {
    if (!canExport) return

    const createdAt = new Date()
    setOutcome({ status: "pending" })

    try {
      const files = await Promise.all(
        selectedDatabases.map(async (database) => {
          const bytes =
            database === "app"
              ? await appEvolu.exportDatabase()
              : await deviceEvolu.exportDatabase()

          return saveEvoluExportFile({
            database,
            bytes,
            filename: createEvoluExportFilename({ createdAt, database }),
          })
        })
      )

      setOutcome({ status: "success", export: { createdAt, files } })
      toast.success(t("settings.evoluExport.status.success"))
    } catch (exportError) {
      setOutcome({ status: "error", message: formatExportError(exportError) })
      toast.error(t("settings.evoluExport.status.error"))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-destructive" />
            <div className="flex flex-col gap-1">
              <CardTitle>{t("settings.evoluExport.warning.title")}</CardTitle>
              <CardDescription>
                {t("settings.evoluExport.warning.description")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>{t("settings.evoluExport.warning.businessData")}</li>
            <li>{t("settings.evoluExport.warning.payments")}</li>
            <li>{t("settings.evoluExport.warning.walletMetadata")}</li>
            <li>{t("settings.evoluExport.warning.localConfiguration")}</li>
            <li>{t("settings.evoluExport.warning.secrets")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.evoluExport.options.title")}</CardTitle>
          <CardDescription>
            {t("settings.evoluExport.options.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>
                {t("settings.evoluExport.options.scope")}
              </FieldLegend>
              <Field orientation="horizontal">
                <Checkbox
                  id="evolu-export-app"
                  checked={selection.app}
                  onCheckedChange={(checked) => {
                    setSelection((value) => ({
                      ...value,
                      app: checked === true,
                    }))
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="evolu-export-app">
                    {t("settings.evoluExport.database.app")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.evoluExport.database.app.description")}
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="evolu-export-device"
                  checked={selection.device}
                  onCheckedChange={(checked) => {
                    setSelection((value) => ({
                      ...value,
                      device: checked === true,
                    }))
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="evolu-export-device">
                    {t("settings.evoluExport.database.device")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.evoluExport.database.device.description")}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend>
                {t("settings.evoluExport.options.format")}
              </FieldLegend>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {t("settings.evoluExport.format.sqlite")}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t("settings.evoluExport.format.description")}
                </span>
              </div>
            </FieldSet>

            <Field orientation="horizontal">
              <Checkbox
                id="evolu-export-warning"
                checked={acceptedWarning}
                onCheckedChange={(checked) => {
                  setAcceptedWarning(checked === true)
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="evolu-export-warning">
                  {t("settings.evoluExport.confirm.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.evoluExport.confirm.description")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {runtime === "capacitor"
              ? t("settings.evoluExport.destination.capacitor")
              : t("settings.evoluExport.destination.web")}
          </p>
          <Button type="button" onClick={handleExport} disabled={!canExport}>
            <Download data-icon="inline-start" />
            {outcome.status === "pending"
              ? t("settings.evoluExport.action.pending")
              : t("settings.evoluExport.action")}
          </Button>
        </CardFooter>
      </Card>

      {outcome.status === "success" || outcome.status === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.evoluExport.status.title")}</CardTitle>
            <CardDescription>
              {outcome.status === "success"
                ? t("settings.evoluExport.status.createdAt", {
                    createdAt: formatExportCreatedAt(outcome.export.createdAt),
                  })
                : t("settings.evoluExport.status.error")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {outcome.status === "error" ? (
              <p className="text-sm text-destructive">{outcome.message}</p>
            ) : null}
            {outcome.status === "success"
              ? outcome.export.files.map((file) => (
                  <ExportedFileRow
                    key={`${file.database}:${file.filename}`}
                    file={file}
                  />
                ))
              : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ExportedFileRow({ file }: { readonly file: SavedEvoluExportFile }) {
  const { t } = useTranslation()
  const Icon = file.destination.type === "capacitor" ? Smartphone : Database

  return (
    <article className="rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t(databaseLabels[file.database])}</Badge>
            <span className="text-sm text-muted-foreground">
              {formatBytes(file.bytes.byteLength)}
            </span>
          </div>
          <p className="break-all font-mono text-xs">{file.filename}</p>
          {file.destination.type === "capacitor" ? (
            <p className="break-all text-xs text-muted-foreground">
              {t("settings.evoluExport.status.savedTo", {
                path: file.destination.path,
              })}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function getSelectedDatabases(
  selection: ExportSelection
): ReadonlyArray<EvoluExportDatabase> {
  const databases: EvoluExportDatabase[] = []

  if (selection.app) databases.push("app")
  if (selection.device) databases.push("device")

  return databases
}

function formatExportError(error: unknown): string {
  if (error instanceof Error) return error.message

  return String(error)
}
