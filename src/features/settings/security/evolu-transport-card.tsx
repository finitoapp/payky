import { sqliteTrue } from "@evolu/common"
import { useAtomValue, useSetAtom } from "jotai"
import { Plus } from "lucide-react"
import { useId, useState } from "react"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
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
import { upsertAccountEvoluWebsocketTransport } from "@/core/evolu/device-account.ts"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { WssUrlSchema } from "@/core/modules/shared/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import { TransportToggleList } from "@/features/settings/security/transport-toggle-list.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export interface EvoluTransportCardProps {
  readonly accountId: AccountId
}

export function EvoluTransportCard({ accountId }: EvoluTransportCardProps) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const setEvoluCounter = useSetAtom(evoluCounterAtom)
  const urlInputId = useId()
  const [url, setUrl] = useState("wss://free.evoluhq.com")
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()

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
                await runMutationWithCompletion((options) =>
                  upsertAccountEvoluWebsocketTransport(
                    deviceEvolu,
                    {
                      accountId,
                      isActive: sqliteTrue,
                      url: result.data,
                    },
                    options
                  )
                )

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

          <TransportToggleList accountId={accountId} />
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
