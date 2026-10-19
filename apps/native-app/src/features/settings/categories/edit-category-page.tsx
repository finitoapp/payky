import { requiredTextCodec } from "@payky/app-shared/inline-edit-codecs"
import type { CatalogCategoryRow } from "@payky/core/modules/catalog-category/catalog-category"
import {
  deleteCatalogCategory,
  updateCatalogCategory,
} from "@payky/core/modules/catalog-category/catalog-category-actions"
import { catalogCategoryByIdQuery } from "@payky/core/modules/catalog-category/catalog-category-queries"
import { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import { router, useLocalSearchParams } from "expo-router"
import Trash from "lucide-react-native/icons/trash"
import { YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { FieldGroup } from "../../../components/ui/field.tsx"
import { useConfirmedRun } from "../../../hooks/use-confirmed-run.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { SettingsFormEmptyState } from "../settings-form-empty-state.tsx"

/** Edits one category, as web's `EditCatalogCategoryPage`: the name saves itself. */
export function EditCatalogCategoryPage() {
  const { catalogCategoryId } = useLocalSearchParams<{
    catalogCategoryId: string
  }>()
  const parsedId = CatalogCategoryId.safeParse(catalogCategoryId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.categories.form.title.edit"
        messageKey="settings.categories.form.invalidId"
      />
    )
  }
  return <EditCatalogCategoryLoader id={parsedId.data} />
}

function EditCatalogCategoryLoader({ id }: { readonly id: CatalogCategoryId }) {
  const [category] = useEvoluQuery(catalogCategoryByIdQuery(id)).data
  if (category === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.categories.form.title.edit"
        messageKey="settings.categories.form.notFound"
      />
    )
  }
  return <EditCatalogCategoryForm category={category} />
}

function EditCatalogCategoryForm({
  category,
}: {
  readonly category: CatalogCategoryRow
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const confirmedRun = useConfirmedRun()

  return (
    <Screen>
      <FadeHeader title={t("settings.categories.form.title.edit")} />
      <YStack gap={20}>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.categories.form.card.title")}</CardTitle>
            <CardDescription>
              {t("settings.categories.form.card.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <InlineEditField
                label={t("settings.categories.form.name.label")}
                placeholder={t("settings.categories.form.name.placeholder")}
                defaultValue={category.name}
                codec={requiredTextCodec}
                errorKey="settings.categories.form.name.invalid"
                onSave={(name) =>
                  runToast(async (run) => {
                    await run.ok(
                      updateCatalogCategory({ id: category.id, name })
                    )
                  })
                }
              />
            </FieldGroup>
          </CardContent>
        </Card>
        <Button
          label={t("settings.categories.delete")}
          iconStart={Trash}
          variant="destructive"
          onPress={() => {
            void (async () => {
              const deleted = await confirmedRun(
                {
                  title: t("settings.categories.delete.confirm.title", {
                    name: category.name,
                  }),
                  description: t(
                    "settings.categories.delete.confirm.description",
                    { name: category.name }
                  ),
                  confirmLabel: t("settings.categories.delete.confirm.confirm"),
                  cancelLabel: t("settings.categories.delete.confirm.cancel"),
                  variant: "destructive",
                },
                deleteCatalogCategory(category.id)
              )
              if (deleted) router.back()
            })()
          }}
        />
      </YStack>
    </Screen>
  )
}
