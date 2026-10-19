import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { createCatalogCategoryAtEnd } from "@payky/core/modules/catalog-category/catalog-category-actions"
import { NonEmptyString255Schema } from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { useState } from "react"
import { Text } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Field } from "../../../components/field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Adds a category, as web's `NewCatalogCategoryPage`: submit, then back. */
export function NewCatalogCategoryPage() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setNameError(null)
    const parsed = NonEmptyString255Schema.safeParse(name.trim())
    if (!parsed.success) {
      setNameError("settings.categories.form.name.invalid")
      return
    }
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(
        createCatalogCategoryAtEnd({ deviceId: null, name: parsed.data })
      )
    })
    setPending(false)
    if (saved) router.back()
  }

  return (
    <Screen>
      <FadeHeader title={t("settings.categories.form.title.create")} />
      <Text color="muted-foreground">
        {t("settings.categories.form.card.description")}
      </Text>
      <Field
        label={t("settings.categories.form.name.label")}
        value={name}
        disabled={pending}
        autoCorrect={false}
        placeholder={t("settings.categories.form.name.placeholder")}
        error={nameError === null ? undefined : t(nameError)}
        onChangeText={(text) => {
          setName(text)
          setNameError(null)
        }}
        onSubmitEditing={() => {
          void submit()
        }}
      />
      <AppButton
        label={t("settings.categories.form.save.create")}
        pending={pending}
        onPress={() => {
          void submit()
        }}
      />
    </Screen>
  )
}
