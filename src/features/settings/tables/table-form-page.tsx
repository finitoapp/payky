import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
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
  NonEmptyString255Schema,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import type { TableRow } from "@/core/modules/table/table.ts"
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
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function NewTablePage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tables.form.title.create")} />
      <TableForm mode="create" />
    </>
  )
}

export function EditTablePage({ tableId }: { readonly tableId: string }) {
  const parsedId = TableId.safeParse(tableId)

  if (!parsedId.success) {
    return <TableFormEmptyState messageKey="settings.tables.form.invalidId" />
  }

  return <EditTablePageContent tableId={parsedId.data} />
}

function EditTablePageContent({ tableId }: { readonly tableId: TableIdType }) {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(tableByIdQuery(tableId))
  const [table] = data

  if (table === undefined) {
    return <TableFormEmptyState messageKey="settings.tables.form.notFound" />
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tables.form.title.edit")} />
      <TableForm mode="edit" table={table} />
    </>
  )
}

function TableFormEmptyState({
  messageKey,
}: {
  readonly messageKey:
    | "settings.tables.form.invalidId"
    | "settings.tables.form.notFound"
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tables.form.title.edit")} />
      <p className="mt-16 px-6 text-center text-muted-foreground">
        {t(messageKey)}
      </p>
    </>
  )
}

function TableForm({
  mode,
  table,
}: {
  readonly mode: "create" | "edit"
  readonly table?: TableRow
}) {
  const appRun = useAppRun()
  const confirm = useConfirmDialog()
  const router = useRouter()
  const { t } = useTranslation()
  const nameInputId = useId()
  const seatCountInputId = useId()
  const codeInputId = useId()
  const [name, setName] = useState(table?.name ?? "")
  const [seatCount, setSeatCount] = useState(
    table === undefined ? "" : String(table.seatCount)
  )
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [seatCountError, setSeatCountError] = useState<TranslationKey | null>(
    null
  )
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  // Not `useConfirmedRun`: `deleteTable` returns a domain Result (it refuses
  // while an open bill still sits on the table, which would strand that bill
  // with no tile in the POS floor view), and that hook only accepts a
  // `never`-error Task.
  const handleDelete = async (tableToDelete: TableRow) => {
    const confirmed = await confirm({
      title: t("settings.tables.delete.confirm.title", {
        name: tableToDelete.name,
      }),
      description: t("settings.tables.delete.confirm.description", {
        name: tableToDelete.name,
      }),
      confirmLabel: t("settings.tables.delete.confirm.confirm"),
      cancelLabel: t("settings.tables.delete.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    await using run = appRun()
    const result = await run(deleteTable(tableToDelete.id))
    if (!result.ok) {
      toast.error(
        t("settings.tables.delete.hasOpenBills", { name: tableToDelete.name })
      )
      return
    }

    router.history.back()
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsFormCard
        title={t("settings.tables.form.card.title")}
        description={t("settings.tables.form.card.description")}
        savedMessage={
          saved
            ? t(
                mode === "create"
                  ? "settings.tables.form.saved.create"
                  : "settings.tables.form.saved.edit"
              )
            : null
        }
        submitLabel={t(
          mode === "create"
            ? "settings.tables.form.save.create"
            : "settings.tables.form.save.edit"
        )}
        pending={pending}
        onSubmit={(event) => {
          event.preventDefault()
          setNameError(null)
          setSeatCountError(null)
          resetSaved()

          const trimmedName = name.trim()
          const nameResult = NonEmptyString255Schema.safeParse(trimmedName)
          if (!nameResult.success) {
            setNameError("settings.tables.form.name.invalid")
            return
          }

          const parsedSeatCount = Number(seatCount)
          if (!Number.isInteger(parsedSeatCount) || parsedSeatCount <= 0) {
            setSeatCountError("settings.tables.form.seatCount.invalid")
            return
          }
          const seatCountValue = PositiveInteger(parsedSeatCount)

          void submit(async () => {
            await using run = appRun()

            if (mode === "create") {
              await run(
                createTableAtEnd({
                  deviceId: null,
                  name: nameResult.data,
                  seatCount: seatCountValue,
                })
              )
              router.history.back()
              return
            }

            if (table === undefined) return

            await run(
              updateTable({
                id: table.id,
                name: nameResult.data,
                seatCount: seatCountValue,
              })
            )
          })
        }}
      >
        <FieldGroup>
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={nameInputId}>
              {t("settings.tables.form.name.label")}
            </FieldLabel>
            <Input
              id={nameInputId}
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
            <FieldLabel htmlFor={seatCountInputId}>
              {t("settings.tables.form.seatCount.label")}
            </FieldLabel>
            <Input
              id={seatCountInputId}
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

          {mode === "edit" && table !== undefined && (
            <Field>
              <FieldLabel htmlFor={codeInputId}>
                {t("settings.tables.form.code.label")}
              </FieldLabel>
              <Input id={codeInputId} value={table.code} disabled readOnly />
              <FieldDescription>
                {t("settings.tables.form.code.description")}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </SettingsFormCard>

      {mode === "edit" && table !== undefined && (
        <Button
          variant="destructive"
          onClick={() => {
            void handleDelete(table)
          }}
        >
          <Trash2Icon data-icon="inline-start" />
          {t("settings.tables.delete")}
        </Button>
      )}
    </div>
  )
}
