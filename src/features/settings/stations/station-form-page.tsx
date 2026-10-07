import { useNavigate } from "@tanstack/react-router"
import { useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { NonEmptyString255Schema } from "@/core/modules/shared/schema.ts"
import { createStation } from "@/core/modules/station/station-actions.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function NewStationPage() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const navigate = useNavigate()
  const formId = useId()
  const [name, setName] = useState("")
  const [nameInvalid, setNameInvalid] = useState(false)
  const { pending, submit } = useSettingsForm()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.stations.new.title")} />
      <SettingsFormCard
        title={t("settings.stations.new.card.title")}
        description={t("settings.stations.new.card.description")}
        savedMessage={null}
        submitLabel={t("settings.stations.new.submit")}
        pending={pending}
        onSubmit={(event) => {
          event.preventDefault()
          const parsedName = NonEmptyString255Schema.safeParse(name.trim())
          if (!parsedName.success) {
            setNameInvalid(true)
            return
          }

          void submit(() =>
            runToast(async (run) => {
              const result = await run(createStation({ name: parsedName.data }))
              if (!result.ok) return "settings.stations.new.numbersExhausted"
              await navigate({
                to: "/settings/stations/$stationId",
                params: { stationId: result.value },
                replace: true,
              })
            })
          )
        }}
      >
        <FieldGroup>
          <Field data-invalid={nameInvalid}>
            <FieldLabel htmlFor={`${formId}-name`}>
              {t("settings.stations.name.label")}
            </FieldLabel>
            <Input
              id={`${formId}-name`}
              value={name}
              disabled={pending}
              aria-invalid={nameInvalid}
              autoComplete="off"
              placeholder={t("settings.stations.name.placeholder")}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setNameInvalid(false)
              }}
            />
            <FieldError>
              {nameInvalid ? t("settings.stations.name.invalid") : null}
            </FieldError>
          </Field>
        </FieldGroup>
      </SettingsFormCard>
    </>
  )
}
