import type { UpdateValues } from "@evolu/common"
import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
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
  NonEmptyString255Schema,
  PositiveInteger,
  PositiveIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import type { Table, TableRow } from "@/core/modules/table/table.ts"
import {
  createTableAtEnd,
  deleteTable,
  updateTable,
} from "@/core/modules/table/table-actions.ts"
import { tableByIdQuery } from "@/core/modules/table/table-queries.ts"
import {
  TableId,
  type TableId as TableIdType,
} from "@/core/modules/table/table-types.ts"
import { requiredTextCodec } from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { SettingsFormEmptyState } from "@/features/settings/settings-form-empty-state.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const seatCountCodec = z.codec(z.string(), PositiveIntegerSchema, {
  decode: (value) => Number(value),
  encode: (value) => String(value),
})

export function NewTablePage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tables.form.title.create")} />
      <CreateTableForm />
    </>
  )
}

export function EditTablePage({ tableId }: { readonly tableId: string }) {
  const parsedId = TableId.safeParse(tableId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.tables.form.title.edit"
        messageKey="settings.tables.form.invalidId"
      />
    )
  }

  return <EditTablePageContent tableId={parsedId.data} />
}

function EditTablePageContent({ tableId }: { readonly tableId: TableIdType }) {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(tableByIdQuery(tableId))
  const [table] = data

  if (table === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.tables.form.title.edit"
        messageKey="settings.tables.form.notFound"
      />
    )
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tables.form.title.edit")} />
      <EditTableForm table={table} />
    </>
  )
}

/**
 * The create form stays a submit-and-navigate form: there is no row to edit
 * in place yet, so it validates both fields at once and only then inserts.
 */
function CreateTableForm() {
  const appRun = useAppRun()
  const router = useRouter()
  const { t } = useTranslation()
  const formId = useId()
  const [name, setName] = useState("")
  const [seatCount, setSeatCount] = useState("")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [seatCountError, setSeatCountError] = useState<TranslationKey | null>(
    null
  )
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  return (
    <SettingsFormCard
      title={t("settings.tables.form.card.title")}
      description={t("settings.tables.form.card.description")}
      savedMessage={saved ? t("settings.tables.form.saved.create") : null}
      submitLabel={t("settings.tables.form.save.create")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setNameError(null)
        setSeatCountError(null)
        resetSaved()

        const nameResult = NonEmptyString255Schema.safeParse(name.trim())
        if (!nameResult.success) {
          setNameError("settings.tables.form.name.invalid")
          return
        }

        const parsedSeatCount = Number(seatCount)
        if (!Number.isInteger(parsedSeatCount) || parsedSeatCount <= 0) {
          setSeatCountError("settings.tables.form.seatCount.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()
          await run(
            createTableAtEnd({
              deviceId: null,
              name: nameResult.data,
              seatCount: PositiveInteger(parsedSeatCount),
            })
          )
          router.history.back()
        })
      }}
    >
      <FieldGroup>
        <Field data-invalid={nameError !== null}>
          <FieldLabel htmlFor={`${formId}-name`}>
            {t("settings.tables.form.name.label")}
          </FieldLabel>
          <Input
            id={`${formId}-name`}
            value={name}
            disabled={pending}
            aria-invalid={nameError !== null}
            autoComplete="off"
            placeholder={t("settings.tables.form.name.placeholder")}
            onChange={(event) => {
              setName(event.currentTarget.value)
              setNameError(null)
              resetSaved()
            }}
          />
          <FieldError>{nameError ? t(nameError) : null}</FieldError>
        </Field>

        <Field data-invalid={seatCountError !== null}>
          <FieldLabel htmlFor={`${formId}-seatCount`}>
            {t("settings.tables.form.seatCount.label")}
          </FieldLabel>
          <Input
            id={`${formId}-seatCount`}
            value={seatCount}
            disabled={pending}
            aria-invalid={seatCountError !== null}
            autoComplete="off"
            inputMode="numeric"
            placeholder={t("settings.tables.form.seatCount.placeholder")}
            onChange={(event) => {
              const nextValue = event.currentTarget.value
              if (/^\d*$/.test(nextValue)) {
                setSeatCount(nextValue)
                setSeatCountError(null)
                resetSaved()
              }
            }}
          />
          <FieldError>{seatCountError ? t(seatCountError) : null}</FieldError>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}

/**
 * The edit form has no submit button: every field saves itself. The row
 * already exists, so each change is an independent update and there is
 * nothing to validate across fields.
 */
function EditTableForm({ table }: { readonly table: TableRow }) {
  const appRun = useAppRun()
  const confirm = useConfirmDialog()
  const router = useRouter()
  const { t } = useTranslation()
  const formId = useId()

  // `updateTable` is a `Task<_, never>`: its only realistic failure is
  // unexpected infrastructure. Let it throw — `InlineEditField` turns that
  // into the toast and withholds its saved tick.
  const saveTable = async (values: Omit<UpdateValues<Table>, "id">) => {
    await using run = appRun()
    await run(updateTable({ id: table.id, ...values }))
  }

  // Not `useConfirmedRun`: `deleteTable` returns a domain Result (it refuses
  // while an open bill still sits on the table, which would strand that bill
  // with no tile in the POS floor view), and that hook only accepts a
  // `never`-error Task.
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t("settings.tables.delete.confirm.title", { name: table.name }),
      description: t("settings.tables.delete.confirm.description", {
        name: table.name,
      }),
      confirmLabel: t("settings.tables.delete.confirm.confirm"),
      cancelLabel: t("settings.tables.delete.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    await using run = appRun()
    const result = await run(deleteTable(table.id))
    if (!result.ok) {
      toast.error(
        t("settings.tables.delete.hasOpenBills", { name: table.name })
      )
      return
    }

    router.history.back()
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.tables.form.card.title")}</CardTitle>
          <CardDescription>
            {t("settings.tables.form.card.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <InlineEditField
              label={t("settings.tables.form.name.label")}
              placeholder={t("settings.tables.form.name.placeholder")}
              defaultValue={table.name}
              codec={requiredTextCodec}
              errorKey="settings.tables.form.name.invalid"
              onSave={(name) => saveTable({ name })}
            />

            <InlineEditField
              label={t("settings.tables.form.seatCount.label")}
              placeholder={t("settings.tables.form.seatCount.placeholder")}
              inputMode="numeric"
              defaultValue={table.seatCount}
              codec={seatCountCodec}
              errorKey="settings.tables.form.seatCount.invalid"
              onSave={(seatCount) => saveTable({ seatCount })}
            />

            <Field>
              <FieldLabel htmlFor={`${formId}-code`}>
                {t("settings.tables.form.code.label")}
              </FieldLabel>
              <Input
                id={`${formId}-code`}
                value={table.code}
                disabled
                readOnly
              />
              <FieldDescription>
                {t("settings.tables.form.code.description")}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        onClick={() => {
          void handleDelete()
        }}
      >
        <Trash2Icon data-icon="inline-start" />
        {t("settings.tables.delete")}
      </Button>
    </div>
  )
}
