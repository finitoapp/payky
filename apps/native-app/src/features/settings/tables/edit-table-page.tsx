import type { UpdateValues } from "@evolu/common"
import {
  positiveIntegerCodec,
  requiredTextCodec,
} from "@payky/app-shared/inline-edit-codecs"
import type { Table, TableRow } from "@payky/core/modules/table/table"
import {
  deleteTable,
  updateTable,
} from "@payky/core/modules/table/table-actions"
import { tableByIdQuery } from "@payky/core/modules/table/table-queries"
import { TableId } from "@payky/core/modules/table/table-types"
import { router, useLocalSearchParams } from "expo-router"
import { Text } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Field } from "../../../components/field.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { SettingsFormEmptyState } from "../settings-form-empty-state.tsx"

/** Edits one table, as web's `EditTablePage`: name and seats save themselves. */
export function EditTablePage() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>()
  const parsedId = TableId.safeParse(tableId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.tables.form.title.edit"
        messageKey="settings.tables.form.invalidId"
      />
    )
  }
  return <EditTableLoader id={parsedId.data} />
}

function EditTableLoader({ id }: { readonly id: TableId }) {
  const [table] = useEvoluQuery(tableByIdQuery(id)).data
  if (table === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.tables.form.title.edit"
        messageKey="settings.tables.form.notFound"
      />
    )
  }
  return <EditTableForm table={table} />
}

function EditTableForm({ table }: { readonly table: TableRow }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const confirm = useConfirm()
  const toast = useToast()

  // `updateTable` is a `Task<_, never>`: `run.ok` throws on an unexpected
  // failure and `useRunToast` turns that into the toast.
  const saveTable = (values: Omit<UpdateValues<Table>, "id">) =>
    runToast(async (run) => {
      await run.ok(updateTable({ id: table.id, ...values }))
    })

  // Not `useConfirmedRun`: `deleteTable` returns a domain Result (it refuses
  // while an open bill still sits on the table, which would strand that bill
  // with no tile in the POS floor view).
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

    let deleted = false
    const ran = await runToast(async (run) => {
      const result = await run(deleteTable(table.id))
      if (!result.ok) {
        // Toasted here: the message needs the table's name, and `runToast`
        // takes a bare key.
        toast.error(
          t("settings.tables.delete.hasOpenBills", { name: table.name })
        )
        return
      }
      deleted = true
    })
    if (ran && deleted) router.back()
  }

  return (
    <Screen>
      <FadeHeader title={t("settings.tables.form.title.edit")} />
      <Text color="muted-foreground">
        {t("settings.tables.form.card.description")}
      </Text>
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
        keyboardType="number-pad"
        defaultValue={table.seatCount}
        codec={positiveIntegerCodec}
        errorKey="settings.tables.form.seatCount.invalid"
        onSave={(seatCount) => saveTable({ seatCount })}
      />
      <Field
        label={t("settings.tables.form.code.label")}
        value={table.code}
        disabled
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.tables.form.code.description")}
      </Text>
      <AppButton
        label={t("settings.tables.delete")}
        variant="destructive"
        onPress={() => {
          void handleDelete()
        }}
      />
    </Screen>
  )
}
