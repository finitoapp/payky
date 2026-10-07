import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx"
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  createEmployee,
  deleteEmployee,
  renameEmployee,
} from "@/core/modules/employee/employee-actions.ts"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import {
  type NonEmptyString255,
  NonEmptyString255Schema,
} from "@/core/modules/shared/schema.ts"
import { requiredTextCodec } from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmedRun } from "@/hooks/use-confirmed-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function EmployeesSettingsPage() {
  const { t } = useTranslation()
  const { data: employees } = useEvoluQuery(activeEmployeesQuery)

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.employees.title")} />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">
              {t("settings.employees.intro")}
            </p>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("settings.employees.empty")}
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {employees.map((employee) => (
                  <EmployeeRowItem key={employee.id} employee={employee} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <NewEmployeeCard />
      </div>
    </>
  )
}

function EmployeeRowItem({
  employee,
}: {
  readonly employee: {
    readonly id: EmployeeId
    readonly name: NonEmptyString255
  }
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const confirmedRun = useConfirmedRun()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="px-3 py-2">
        <InlineEditField
          hideLabel
          startEditing
          label={t("settings.employees.rename.input", { name: employee.name })}
          defaultValue={employee.name}
          codec={requiredTextCodec}
          errorKey="settings.employees.name.invalid"
          onSave={async (name) => {
            await using run = appRun()
            await run.ok(renameEmployee({ id: employee.id, name }))
          }}
          onEditFinished={() => {
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium">
        {employee.name}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("settings.employees.rename", { name: employee.name })}
          onClick={() => {
            setEditing(true)
          }}
        >
          <PencilIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("settings.employees.remove", { name: employee.name })}
          onClick={() =>
            void confirmedRun(
              {
                title: t("settings.employees.remove.confirm.title", {
                  name: employee.name,
                }),
                description: t("settings.employees.remove.confirm.description"),
                confirmLabel: t("settings.employees.remove.confirm.confirm"),
                cancelLabel: t("settings.employees.remove.confirm.cancel"),
                variant: "destructive",
              },
              deleteEmployee(employee.id)
            )
          }
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  )
}

function NewEmployeeCard() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const formId = useId()
  const [name, setName] = useState("")
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const parsedName = NonEmptyString255Schema.safeParse(name.trim())
            if (!parsedName.success) {
              setInvalid(true)
              return
            }

            void (async () => {
              setPending(true)
              const added = await runToast(async (run) => {
                await run.ok(createEmployee({ name: parsedName.data }))
              })
              setPending(false)
              if (added) setName("")
            })()
          }}
        >
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`${formId}-name`}>
              {t("settings.employees.add.label")}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id={`${formId}-name`}
                value={name}
                disabled={pending}
                aria-invalid={invalid}
                autoComplete="off"
                placeholder={t("settings.employees.add.placeholder")}
                onChange={(event) => {
                  setName(event.currentTarget.value)
                  setInvalid(false)
                }}
              />
              <Button type="submit" disabled={pending}>
                <PlusIcon data-icon="inline-start" />
                {t("settings.employees.add")}
              </Button>
            </div>
            <FieldError>
              {invalid ? t("settings.employees.name.invalid") : null}
            </FieldError>
          </Field>
        </form>
      </CardContent>
    </Card>
  )
}
