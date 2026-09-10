import { Capacitor } from "@capacitor/core"
import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { createFileRoute } from "@tanstack/react-router"
import { format, subDays } from "date-fns"
import { Plus, Trash2, TriangleAlert } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
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
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { fiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import {
  addFioPluginToken,
  deleteFioPluginToken,
  saveFioPlugin,
  updateFioPluginSyncPointer,
} from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import {
  fiatBankAccountFioPluginQuery,
  fioPluginSyncPointerByPluginIdQuery,
  fioPluginTokensByPluginIdQuery,
} from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import {
  type DateString,
  DateStringSchema,
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "@/core/modules/shared/schema.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/fio-plugin")({
  component: FioPluginSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

const defaultNumberOfSecondsBetweenChecks = "30"
const defaultSyncLookbackDays = "1"
const getDefaultLastSyncedDate = (): DateString =>
  DateStringSchema.decode(format(subDays(new Date(), 1), "yyyy-MM-dd"))

const normalizeToken = (value: string) => value.trim()

function FioPluginSettingsPage() {
  const { t } = useTranslation()
  const isNativeRuntime = Capacitor.isNativePlatform()
  const { data } = useEvoluQuery(fiatBankAccountFioPluginQuery)
  const [plugin] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.fioPlugin.title")} />
      <div className="flex flex-col gap-5">
        {!isNativeRuntime ? <FioPluginNativeRuntimeAlert /> : null}
        <FioPluginForm plugin={plugin} isNativeRuntime={isNativeRuntime} />
        {/*
         * Tokens are reachable whether or not the `fioPlugin` row exists —
         * they hang off the fixed `fioPluginId`, and `activeFioPluginsQuery`
         * inner-joins the plugin, so tokens saved first simply sit unused
         * until it is enabled. Keeping these mounted unconditionally also
         * means no query key appears mid-session, which is what used to make
         * their first render suspend on a promise React cannot cache.
         */}
        <FioPluginTokenForm fioPluginId={fioPluginId} />
        <FioPluginTokenList fioPluginId={fioPluginId} />
      </div>
    </>
  )
}

interface FioPluginFormProps {
  readonly isNativeRuntime: boolean
  readonly plugin:
    | {
        readonly id: FioPluginId
        readonly isActive: 0 | 1
        readonly numberOfSecondsBetweenChecks: number
        readonly syncLookbackDays: number | null
      }
    | undefined
}

function FioPluginNativeRuntimeAlert() {
  const { t } = useTranslation()

  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>
        {t("settings.fioPlugin.nativeRuntimeWarning.title")}
      </AlertTitle>
      <AlertDescription>
        {t("settings.fioPlugin.nativeRuntimeWarning.description")}
      </AlertDescription>
    </Alert>
  )
}

function FioPluginForm({ plugin, isNativeRuntime }: FioPluginFormProps) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const pointerQuery = useMemo(
    () => fioPluginSyncPointerByPluginIdQuery(fioPluginId),
    []
  )
  const { data: pointers } = useEvoluQuery(pointerQuery)
  const [pointer] = pointers
  const lastSyncedDate = pointer?.lastSyncedDate ?? getDefaultLastSyncedDate()
  const activeInputId = useId()
  const intervalInputId = useId()
  const syncLookbackDaysInputId = useId()
  const lastSyncedDateInputId = useId()
  const [isActive, setIsActive] = useState(false)
  const [numberOfSecondsBetweenChecks, setNumberOfSecondsBetweenChecks] =
    useState(defaultNumberOfSecondsBetweenChecks)
  const [syncLookbackDays, setSyncLookbackDays] = useState(
    defaultSyncLookbackDays
  )
  const [editableLastSyncedDate, setEditableLastSyncedDate] = useState<string>(
    getDefaultLastSyncedDate
  )
  const [intervalError, setIntervalError] = useState<TranslationKey | null>(
    null
  )
  const [syncLookbackDaysError, setSyncLookbackDaysError] =
    useState<TranslationKey | null>(null)
  const [lastSyncedDateError, setLastSyncedDateError] =
    useState<TranslationKey | null>(null)
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  useEffect(() => {
    setIsActive(plugin?.isActive === sqliteTrue)
    setNumberOfSecondsBetweenChecks(
      plugin?.numberOfSecondsBetweenChecks.toString() ??
        defaultNumberOfSecondsBetweenChecks
    )
    setSyncLookbackDays(
      plugin?.syncLookbackDays?.toString() ?? defaultSyncLookbackDays
    )
    setEditableLastSyncedDate(lastSyncedDate)
  }, [plugin, lastSyncedDate])

  return (
    <SettingsFormCard
      title={t("settings.fioPlugin.form.title")}
      description={t("settings.fioPlugin.form.description")}
      savedMessage={saved ? t("settings.fioPlugin.saved") : null}
      submitLabel={
        <>
          <Plus data-icon="inline-start" />
          {t("settings.fioPlugin.save")}
        </>
      }
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setIntervalError(null)
        setSyncLookbackDaysError(null)
        setLastSyncedDateError(null)
        resetSaved()

        const intervalResult = PositiveIntegerFromStringSchema.safeParse(
          numberOfSecondsBetweenChecks.trim()
        )
        const syncLookbackDaysResult =
          PositiveIntegerFromStringSchema.safeParse(syncLookbackDays.trim())
        const normalizedLastSyncedDate = editableLastSyncedDate.trim()
        const lastSyncedDateResult = DateStringSchema.safeParse(
          normalizedLastSyncedDate
        )

        if (!intervalResult.success) {
          setIntervalError("settings.fioPlugin.interval.invalid")
          return
        }

        if (!syncLookbackDaysResult.success) {
          setSyncLookbackDaysError(
            "settings.fioPlugin.syncLookbackDays.invalid"
          )
          return
        }

        if (!lastSyncedDateResult.success) {
          setLastSyncedDateError("settings.fioPlugin.lastSyncedDate.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()

          // One path whether or not the row exists yet: the plugin is a
          // singleton at a fixed id, so `saveFioPlugin` upserts it and this
          // form never has to know which case it is in.
          await run.ok(
            saveFioPlugin({
              accountId: fiatBankAccountId,
              numberOfSecondsBetweenChecks: intervalResult.data,
              syncLookbackDays: syncLookbackDaysResult.data,
              isActive: isNativeRuntime && isActive ? sqliteTrue : sqliteFalse,
            })
          )
          await run.ok(
            updateFioPluginSyncPointer({
              id: fioPluginId,
              lastSyncedDate: lastSyncedDateResult.data,
            })
          )
        })
      }}
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={activeInputId}
            checked={isNativeRuntime && isActive}
            disabled={pending || !isNativeRuntime}
            onCheckedChange={(checked) => {
              setIsActive(checked)
              resetSaved()
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={activeInputId}>
              {t("settings.fioPlugin.active.label")}
            </FieldLabel>
            <FieldDescription>
              {t("settings.fioPlugin.active.description")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field data-invalid={intervalError !== null}>
          <FieldLabel htmlFor={intervalInputId}>
            {t("settings.fioPlugin.interval.label")}
          </FieldLabel>
          <Input
            id={intervalInputId}
            value={numberOfSecondsBetweenChecks}
            disabled={pending}
            aria-invalid={intervalError !== null}
            inputMode="numeric"
            min={1}
            type="number"
            onChange={(event) => {
              setNumberOfSecondsBetweenChecks(event.currentTarget.value)
              setIntervalError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.fioPlugin.interval.description")}
          </FieldDescription>
          <FieldError>{intervalError ? t(intervalError) : null}</FieldError>
        </Field>

        <Field data-invalid={syncLookbackDaysError !== null}>
          <FieldLabel htmlFor={syncLookbackDaysInputId}>
            {t("settings.fioPlugin.syncLookbackDays.label")}
          </FieldLabel>
          <Input
            id={syncLookbackDaysInputId}
            value={syncLookbackDays}
            disabled={pending}
            aria-invalid={syncLookbackDaysError !== null}
            inputMode="numeric"
            min={1}
            type="number"
            onChange={(event) => {
              setSyncLookbackDays(event.currentTarget.value)
              setSyncLookbackDaysError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.fioPlugin.syncLookbackDays.description")}
          </FieldDescription>
          <FieldError>
            {syncLookbackDaysError ? t(syncLookbackDaysError) : null}
          </FieldError>
        </Field>

        <Field data-invalid={lastSyncedDateError !== null}>
          <FieldLabel htmlFor={lastSyncedDateInputId}>
            {t("settings.fioPlugin.lastSyncedDate.label")}
          </FieldLabel>
          <Input
            id={lastSyncedDateInputId}
            value={editableLastSyncedDate}
            disabled={pending}
            aria-invalid={lastSyncedDateError !== null}
            type="date"
            onChange={(event) => {
              setEditableLastSyncedDate(event.currentTarget.value)
              setLastSyncedDateError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.fioPlugin.lastSyncedDate.description")}
          </FieldDescription>
          <FieldError>
            {lastSyncedDateError ? t(lastSyncedDateError) : null}
          </FieldError>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}

interface FioPluginTokenListProps {
  readonly fioPluginId: FioPluginId
}

/**
 * Adding a token is its own form on purpose. It used to be a field on the
 * basic-settings form, which meant every save wrote the token again: saving
 * without touching it appended a duplicate row, and changing it left the old
 * one in the sync job's rotation set, so the job kept retrying a revoked
 * token. See `addFioPluginToken`.
 */
function FioPluginTokenForm({ fioPluginId }: FioPluginTokenListProps) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const tokenInputId = useId()
  const [token, setToken] = useState("")
  const [tokenError, setTokenError] = useState<TranslationKey | null>(null)
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  return (
    <SettingsFormCard
      title={t("settings.fioPlugin.tokens.add.title")}
      description={t("settings.fioPlugin.tokens.add.description")}
      savedMessage={saved ? t("settings.fioPlugin.tokens.add.saved") : null}
      submitLabel={
        <>
          <Plus data-icon="inline-start" />
          {t("settings.fioPlugin.tokens.add.submit")}
        </>
      }
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setTokenError(null)
        resetSaved()

        const normalizedToken = normalizeToken(token)
        if (!normalizedToken) {
          setTokenError("settings.fioPlugin.token.required")
          return
        }

        const tokenResult = NonEmptyString255Schema.safeParse(normalizedToken)
        if (!tokenResult.success) {
          setTokenError("settings.fioPlugin.token.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()
          await run.ok(
            addFioPluginToken({ fioPluginId, token: tokenResult.data })
          )
          setToken("")
        })
      }}
    >
      <FieldGroup>
        <Field data-invalid={tokenError !== null}>
          <FieldLabel htmlFor={tokenInputId}>
            {t("settings.fioPlugin.token.label")}
          </FieldLabel>
          <PasswordTextarea
            id={tokenInputId}
            value={token}
            hideLabel={t("passwordTextarea.hide")}
            showLabel={t("passwordTextarea.show")}
            disabled={pending}
            aria-invalid={tokenError !== null}
            autoComplete="off"
            onChange={(event) => {
              setToken(event.currentTarget.value)
              setTokenError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.fioPlugin.token.description")}
          </FieldDescription>
          <FieldError>{tokenError ? t(tokenError) : null}</FieldError>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}

function FioPluginTokenList({ fioPluginId }: FioPluginTokenListProps) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const tokensQuery = useMemo(
    () => fioPluginTokensByPluginIdQuery(fioPluginId),
    [fioPluginId]
  )
  const { data: tokens } = useEvoluQuery(tokensQuery)
  const [pendingTokenId, setPendingTokenId] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.fioPlugin.tokens.title")}</CardTitle>
        <CardDescription>
          {t("settings.fioPlugin.tokens.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.fioPlugin.tokens.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium">
                    {t("settings.fioPlugin.tokens.item")}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {maskToken(token.token)}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">
                    {t("settings.fioPlugin.tokens.active")}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingTokenId !== null}
                    onClick={async () => {
                      setPendingTokenId(token.id)
                      try {
                        await using run = appRun()

                        await run.ok(deleteFioPluginToken(token.id))
                      } finally {
                        setPendingTokenId(null)
                      }
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    {t("settings.fioPlugin.tokens.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function maskToken(token: string) {
  const suffix = token.slice(-4)

  if (!suffix) {
    return "********"
  }

  return `********${suffix}`
}
