import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { parseTableForm } from "@payky/app-shared/table-form"
import { createTableAtEnd } from "@payky/core/modules/table/table-actions"
import { router } from "expo-router"
import { useState } from "react"
import { Text } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Adds a table, as web's `NewTablePage`: validates both fields, inserts, goes back. */
export function NewTablePage() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [name, setName] = useState("")
  const [seatCount, setSeatCount] = useState("")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [seatCountError, setSeatCountError] = useState<TranslationKey | null>(
    null
  )
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setNameError(null)
    setSeatCountError(null)
    const form = parseTableForm({ name, seatCount })
    if (!form.ok) {
      if (form.field === "name") setNameError(form.errorKey)
      else setSeatCountError(form.errorKey)
      return
    }
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(
        createTableAtEnd({
          deviceId: null,
          name: form.name,
          seatCount: form.seatCount,
        })
      )
    })
    setPending(false)
    if (saved) router.back()
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.tables.form.title.create")} />
      <Text color="muted-foreground">
        {t("settings.tables.form.card.description")}
      </Text>
      <Field
        label={t("settings.tables.form.name.label")}
        value={name}
        disabled={pending}
        autoCorrect={false}
        placeholder={t("settings.tables.form.name.placeholder")}
        error={nameError === null ? undefined : t(nameError)}
        onChangeText={(text) => {
          setName(text)
          setNameError(null)
        }}
      />
      <Field
        label={t("settings.tables.form.seatCount.label")}
        value={seatCount}
        disabled={pending}
        keyboardType="number-pad"
        placeholder={t("settings.tables.form.seatCount.placeholder")}
        error={seatCountError === null ? undefined : t(seatCountError)}
        onChangeText={(text) => {
          // Digits only, as web's field.
          if (/^\d*$/u.test(text)) {
            setSeatCount(text)
            setSeatCountError(null)
          }
        }}
        onSubmitEditing={() => {
          void submit()
        }}
      />
      <AppButton
        label={t("settings.tables.form.save.create")}
        pending={pending}
        onPress={() => {
          void submit()
        }}
      />
    </Screen>
  )
}
