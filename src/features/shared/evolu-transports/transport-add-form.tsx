import { sqliteTrue } from "@evolu/common"
import { useAtomValue } from "jotai"
import { Plus } from "lucide-react"
import { useId, useState } from "react"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  defaultEvoluTransportUrls,
  upsertAccountEvoluWebsocketTransport,
} from "@/core/evolu/device-account.ts"
import type { DeviceAccountId } from "@/core/evolu/device-client.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { WssUrlSchema } from "@/core/modules/shared/schema.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface TransportAddFormProps {
  readonly accountId: DeviceAccountId
}

/**
 * Adds an active WebSocket relay to an account and reopens the app database
 * so it starts syncing through it.
 */
export function TransportAddForm({ accountId }: TransportAddFormProps) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const runToast = useRunToast()
  const urlInputId = useId()
  const [url, setUrl] = useState<string>("")
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        setSaved(false)

        const result = WssUrlSchema.safeParse(url.trim())

        if (!result.success) {
          setError("settings.security.transports.url.invalid")
          return
        }

        setPending(true)
        await runToast(async () => {
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

          reloadAppEvolu()
          setUrl("")
          setSaved(true)
        })
        setPending(false)
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
            placeholder={defaultEvoluTransportUrls[0]}
            onChange={(event) => {
              setUrl(event.currentTarget.value)
              setError(null)
              setSaved(false)
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
  )
}
