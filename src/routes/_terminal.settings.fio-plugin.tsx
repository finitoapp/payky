import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { createRun } from "@evolu/web"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { fiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import {
  createFioPlugin,
  deleteFioPluginToken,
  updateFioPlugin,
} from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import {
  fiatBankAccountFioPluginQuery,
  fioPluginTokensByPluginIdQuery,
} from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import {
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "@/core/modules/shared/schema.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/fio-plugin")({
  component: FioPluginSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

const defaultNumberOfSecondsBetweenChecks = "30"

const normalizeToken = (value: string) => value.trim()

function FioPluginSettingsPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(fiatBankAccountFioPluginQuery)
  const [plugin] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.fioPlugin.title")} />
      <div className="flex flex-col gap-5">
        <FioPluginForm plugin={plugin} />
        {plugin ? (
          <FioPluginTokenList fioPluginId={plugin.id} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.fioPlugin.tokens.title")}</CardTitle>
              <CardDescription>
                {t("settings.fioPlugin.tokens.createFirst")}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </>
  )
}

interface FioPluginFormProps {
  readonly plugin:
    | {
        readonly id: FioPluginId
        readonly isActive: 0 | 1
        readonly numberOfSecondsBetweenChecks: number
      }
    | undefined
}

function FioPluginForm({ plugin }: FioPluginFormProps) {
  const { t } = useTranslation()
  const evolu = useEvolu()
  const activeInputId = useId()
  const intervalInputId = useId()
  const tokenInputId = useId()
  const [isActive, setIsActive] = useState(false)
  const [numberOfSecondsBetweenChecks, setNumberOfSecondsBetweenChecks] =
    useState(defaultNumberOfSecondsBetweenChecks)
  const [token, setToken] = useState("")
  const [intervalError, setIntervalError] = useState<TranslationKey | null>(
    null
  )
  const [tokenError, setTokenError] = useState<TranslationKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setIsActive(plugin?.isActive === sqliteTrue)
    setNumberOfSecondsBetweenChecks(
      plugin?.numberOfSecondsBetweenChecks.toString() ??
        defaultNumberOfSecondsBetweenChecks
    )
  }, [plugin])

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setIntervalError(null)
        setTokenError(null)
        setSaved(false)

        const intervalResult = PositiveIntegerFromStringSchema.safeParse(
          numberOfSecondsBetweenChecks.trim()
        )
        const normalizedToken = normalizeToken(token)
        const tokenResult = normalizedToken
          ? NonEmptyString255Schema.safeParse(normalizedToken)
          : null

        if (!intervalResult.success) {
          setIntervalError("settings.fioPlugin.interval.invalid")
          return
        }

        if (!plugin && !tokenResult) {
          setTokenError("settings.fioPlugin.token.required")
          return
        }

        if (tokenResult?.success === false) {
          setTokenError("settings.fioPlugin.token.invalid")
          return
        }

        setPending(true)
        try {
          await using run = createRun({
            evolu,
            evoluOwnerId: evolu.appOwner.id,
          })

          if (plugin) {
            await run(
              updateFioPlugin({
                id: plugin.id,
                accountId: fiatBankAccountId,
                numberOfSecondsBetweenChecks: intervalResult.data,
                isActive: isActive ? sqliteTrue : sqliteFalse,
                token: tokenResult?.data,
              })
            )
          } else if (tokenResult) {
            await run(
              createFioPlugin({
                accountId: fiatBankAccountId,
                numberOfSecondsBetweenChecks: intervalResult.data,
                isActive: isActive ? sqliteTrue : sqliteFalse,
                token: tokenResult.data,
              })
            )
          }

          setToken("")
          setSaved(true)
        } finally {
          setPending(false)
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.fioPlugin.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.fioPlugin.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id={activeInputId}
                checked={isActive}
                disabled={pending}
                onCheckedChange={(checked) => {
                  setIsActive(checked)
                  setSaved(false)
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
                  setSaved(false)
                }}
              />
              <FieldDescription>
                {t("settings.fioPlugin.interval.description")}
              </FieldDescription>
              <FieldError>{intervalError ? t(intervalError) : null}</FieldError>
            </Field>

            <Field data-invalid={tokenError !== null}>
              <FieldLabel htmlFor={tokenInputId}>
                {t("settings.fioPlugin.token.label")}
              </FieldLabel>
              <PasswordTextarea
                id={tokenInputId}
                value={token}
                disabled={pending}
                aria-invalid={tokenError !== null}
                autoComplete="off"
                onChange={(event) => {
                  setToken(event.currentTarget.value)
                  setTokenError(null)
                  setSaved(false)
                }}
              />
              <FieldDescription>
                {plugin
                  ? t("settings.fioPlugin.token.description")
                  : t("settings.fioPlugin.token.firstDescription")}
              </FieldDescription>
              <FieldError>{tokenError ? t(tokenError) : null}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? t("settings.fioPlugin.saved") : null}
          </p>
          <Button type="submit" disabled={pending}>
            <Plus data-icon="inline-start" />
            {plugin
              ? t("settings.fioPlugin.save")
              : t("settings.fioPlugin.create")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

interface FioPluginTokenListProps {
  readonly fioPluginId: FioPluginId
}

function FioPluginTokenList({ fioPluginId }: FioPluginTokenListProps) {
  const { t } = useTranslation()
  const evolu = useEvolu()
  const { data: tokens } = useEvoluQuery(
    fioPluginTokensByPluginIdQuery(fioPluginId)
  )
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
                        await using run = createRun({
                          evolu,
                          evoluOwnerId: evolu.appOwner.id,
                        })

                        await run(deleteFioPluginToken(token.id))
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
