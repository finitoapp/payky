import { type KyselyNotNull, sqliteFalse, sqliteTrue } from "@evolu/common"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { Plus, Power, PowerOff } from "lucide-react"
import { useId, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  type AccountId,
  createDeviceQuery,
} from "@/core/evolu/device-client.ts"
import { WssUrlSchema } from "@/core/modules/shared/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/security")({
  component: SecuritySettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

const accountTransportsQuery = (accountId: AccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("accountEvoluTransport")
      .innerJoin(
        "accountEvoluTransportWebsocket",
        "accountEvoluTransportWebsocket.id",
        "accountEvoluTransport.id"
      )
      .select([
        "accountEvoluTransport.id as id",
        "accountEvoluTransport.type as type",
        "accountEvoluTransport.isActive as isActive",
        "accountEvoluTransportWebsocket.url as url",
      ])
      .where("accountEvoluTransport.accountId", "=", accountId)
      .where("accountEvoluTransport.isDeleted", "is not", sqliteTrue)
      .where("accountEvoluTransport.isActive", "is not", null)
      .where("accountEvoluTransportWebsocket.isDeleted", "is not", sqliteTrue)
      .where("accountEvoluTransportWebsocket.url", "is not", null)
      .orderBy("accountEvoluTransport.createdAt", "desc")
      .$narrowType<{
        isActive: KyselyNotNull
        url: KyselyNotNull
      }>()
  )

function SecuritySettingsPage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.security.title")} />
      <div className="flex flex-col gap-5">
        <RecoveryPhraseCard mnemonic={account.mnemonic} />
        <EvoluTransportCard accountId={account.id} />
      </div>
    </>
  )
}

interface RecoveryPhraseCardProps {
  readonly mnemonic: string
}

function RecoveryPhraseCard({ mnemonic }: RecoveryPhraseCardProps) {
  const { t } = useTranslation()
  const mnemonicInputId = useId()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.mnemonic.title")}</CardTitle>
        <CardDescription>
          {t("settings.security.mnemonic.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={mnemonicInputId}>
              {t("settings.security.mnemonic.label")}
            </FieldLabel>
            <PasswordTextarea
              id={mnemonicInputId}
              value={mnemonic}
              readOnly
              aria-readonly="true"
              autoComplete="off"
            />
            <FieldDescription>
              {t("settings.security.mnemonic.help")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

interface EvoluTransportCardProps {
  readonly accountId: AccountId
}

function EvoluTransportCard({ accountId }: EvoluTransportCardProps) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const setEvoluCounter = useSetAtom(evoluCounterAtom)
  const urlInputId = useId()
  const { data: transports } = useDeviceEvoluQuery(
    accountTransportsQuery(accountId)
  )
  const [url, setUrl] = useState("wss://free.evoluhq.com")
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()
  const [pendingTransportId, setPendingTransportId] = useState<string | null>(
    null
  )

  const reloadAppAccount = () => {
    setEvoluCounter((current) => current + 1)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.transports.title")}</CardTitle>
        <CardDescription>
          {t("settings.security.transports.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              resetSaved()

              const result = WssUrlSchema.safeParse(url.trim())

              if (!result.success) {
                setError("settings.security.transports.url.invalid")
                return
              }

              void submit(async () => {
                await runMutationWithCompletion((options) => {
                  const { id } = deviceEvolu.insert(
                    "accountEvoluTransport",
                    {
                      accountId,
                      type: "WebSocket",
                      isActive: sqliteTrue,
                    },
                    options
                  )

                  deviceEvolu.upsert(
                    "accountEvoluTransportWebsocket",
                    {
                      id,
                      url: result.data,
                    },
                    options
                  )
                })

                reloadAppAccount()
                setUrl("")
                return undefined
              })
            }}
          >
            <FieldGroup>
              <Field data-invalid={error !== null}>
                <FieldLabel htmlFor={urlInputId}>
                  {t("settings.security.transports.url.label")}
                </FieldLabel>
                <Input
                  id={urlInputId}
                  value={url}
                  disabled={pending}
                  aria-invalid={error !== null}
                  autoComplete="off"
                  inputMode="url"
                  placeholder="wss://free.evoluhq.com"
                  onChange={(event) => {
                    setUrl(event.currentTarget.value)
                    setError(null)
                    resetSaved()
                  }}
                />
                <FieldDescription>
                  {t("settings.security.transports.url.description")}
                </FieldDescription>
                <FieldError>{error ? t(error) : null}</FieldError>
              </Field>
            </FieldGroup>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {saved ? t("settings.security.transports.saved") : null}
              </p>
              <Button type="submit" disabled={pending}>
                <Plus data-icon="inline-start" />
                {t("settings.security.transports.add")}
              </Button>
            </div>
          </form>

          {transports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.security.transports.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {transports.map((transport) => (
                <TransportListItem
                  key={transport.id}
                  isActive={transport.isActive}
                  pendingTransportId={pendingTransportId}
                  url={transport.url}
                  onToggle={async (isActive) => {
                    setPendingTransportId(transport.id)
                    try {
                      await runMutationWithCompletion((options) =>
                        deviceEvolu.update(
                          "accountEvoluTransport",
                          {
                            id: transport.id,
                            isActive,
                          },
                          options
                        )
                      )
                      reloadAppAccount()
                    } finally {
                      setPendingTransportId(null)
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {t("settings.security.transports.footer")}
        </p>
      </CardFooter>
    </Card>
  )
}

interface TransportListItemProps {
  readonly isActive: 0 | 1
  readonly pendingTransportId: string | null
  readonly url: string
  readonly onToggle: (isActive: 0 | 1) => void
}

function TransportListItem({
  isActive,
  pendingTransportId,
  url,
  onToggle,
}: TransportListItemProps) {
  const { t } = useTranslation()
  const active = isActive === sqliteTrue
  const Icon = active ? PowerOff : Power

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">
          {t("settings.security.transports.websocket")}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {url}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={active ? "secondary" : "outline"}>
          {active
            ? t("settings.security.transports.active")
            : t("settings.security.transports.inactive")}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendingTransportId !== null}
          onClick={() => {
            onToggle(active ? sqliteFalse : sqliteTrue)
          }}
        >
          <Icon data-icon="inline-start" />
          {active
            ? t("settings.security.transports.deactivate")
            : t("settings.security.transports.activate")}
        </Button>
      </div>
    </li>
  )
}
