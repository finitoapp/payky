import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"
import { useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import type { CatalogCategoryRow } from "@/core/modules/catalog-category/catalog-category.ts"
import {
  createCatalogCategoryAtEnd,
  deleteCatalogCategory,
  updateCatalogCategory,
} from "@/core/modules/catalog-category/catalog-category-actions.ts"
import { catalogCategoryByIdQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import {
  CatalogCategoryId,
  type CatalogCategoryId as CatalogCategoryIdType,
} from "@/core/modules/catalog-category/catalog-category-types.ts"
import { NonEmptyString255Schema } from "@/core/modules/shared/schema.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmedRun } from "@/hooks/use-confirmed-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function NewCatalogCategoryPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.categories.form.title.create")} />
      <CatalogCategoryForm mode="create" />
    </>
  )
}

export function EditCatalogCategoryPage({
  catalogCategoryId,
}: {
  readonly catalogCategoryId: string
}) {
  const parsedId = CatalogCategoryId.safeParse(catalogCategoryId)

  if (!parsedId.success) {
    return (
      <CatalogCategoryFormEmptyState messageKey="settings.categories.form.invalidId" />
    )
  }

  return <EditCatalogCategoryPageContent catalogCategoryId={parsedId.data} />
}

function EditCatalogCategoryPageContent({
  catalogCategoryId,
}: {
  readonly catalogCategoryId: CatalogCategoryIdType
}) {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(catalogCategoryByIdQuery(catalogCategoryId))
  const [category] = data

  if (category === undefined) {
    return (
      <CatalogCategoryFormEmptyState messageKey="settings.categories.form.notFound" />
    )
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.categories.form.title.edit")} />
      <CatalogCategoryForm mode="edit" category={category} />
    </>
  )
}

function CatalogCategoryFormEmptyState({
  messageKey,
}: {
  readonly messageKey:
    | "settings.categories.form.invalidId"
    | "settings.categories.form.notFound"
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.categories.form.title.edit")} />
      <p className="mt-16 px-6 text-center text-muted-foreground">
        {t(messageKey)}
      </p>
    </>
  )
}

function CatalogCategoryForm({
  mode,
  category,
}: {
  readonly mode: "create" | "edit"
  readonly category?: CatalogCategoryRow
}) {
  const appRun = useAppRun()
  const confirmedRun = useConfirmedRun()
  const router = useRouter()
  const { t } = useTranslation()
  const nameInputId = useId()
  const [name, setName] = useState(category?.name ?? "")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  return (
    <div className="flex flex-col gap-5">
      <SettingsFormCard
        title={t("settings.categories.form.card.title")}
        description={t("settings.categories.form.card.description")}
        savedMessage={
          saved
            ? t(
                mode === "create"
                  ? "settings.categories.form.saved.create"
                  : "settings.categories.form.saved.edit"
              )
            : null
        }
        submitLabel={t(
          mode === "create"
            ? "settings.categories.form.save.create"
            : "settings.categories.form.save.edit"
        )}
        pending={pending}
        onSubmit={(event) => {
          event.preventDefault()
          setNameError(null)
          resetSaved()

          const trimmedName = name.trim()
          const nameResult = NonEmptyString255Schema.safeParse(trimmedName)
          if (!nameResult.success) {
            setNameError("settings.categories.form.name.invalid")
            return
          }

          void submit(async () => {
            await using run = appRun()

            if (mode === "create") {
              await run(
                createCatalogCategoryAtEnd({
                  deviceId: null,
                  name: nameResult.data,
                })
              )
              router.history.back()
              return
            }

            if (category === undefined) return

            await run(
              updateCatalogCategory({
                id: category.id,
                name: nameResult.data,
              })
            )
          })
        }}
      >
        <FieldGroup>
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={nameInputId}>
              {t("settings.categories.form.name.label")}
            </FieldLabel>
            <Input
              id={nameInputId}
              value={name}
              disabled={pending}
              aria-invalid={nameError !== null}
              autoComplete="off"
              placeholder={t("settings.categories.form.name.placeholder")}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setNameError(null)
                resetSaved()
              }}
            />
            <FieldError>{nameError ? t(nameError) : null}</FieldError>
          </Field>
        </FieldGroup>
      </SettingsFormCard>

      {mode === "edit" && category !== undefined && (
        <Button
          variant="destructive"
          onClick={() => {
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
              if (deleted) router.history.back()
            })()
          }}
        >
          <Trash2Icon data-icon="inline-start" />
          {t("settings.categories.delete")}
        </Button>
      )}
    </div>
  )
}
