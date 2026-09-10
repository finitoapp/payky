import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
} from "lucide-react"
import { useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { NonEmptyString255Schema } from "@/core/modules/shared/schema.ts"
import type { TaxRateRow } from "@/core/modules/tax-rate/tax-rate.ts"
import {
  activateTaxRate,
  archiveTaxRate,
  createTaxRate,
  renameTaxRate,
  setDefaultTaxRate,
} from "@/core/modules/tax-rate/tax-rate-actions.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import {
  decimalStringToTaxRatePercentage,
  taxRatePercentageToDecimalString,
} from "@/core/modules/tax-rate/tax-rate-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function TaxRatesSettingsPage() {
  const { t } = useTranslation()
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)
  const activeTaxRates = taxRates.filter((rate) => rate.deactivatedAt === null)
  const archivedTaxRates = taxRates.filter(
    (rate) => rate.deactivatedAt !== null
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.taxRates.title")} />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">
              {t("settings.taxRates.description")}
            </p>
          </CardHeader>
          <CardContent>
            {activeTaxRates.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("settings.taxRates.empty")}
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {activeTaxRates.map((taxRate) => (
                  <TaxRateRowItem key={taxRate.id} taxRate={taxRate} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <NewTaxRateCard />

        {archivedTaxRates.length > 0 && (
          <Card>
            <CardHeader>
              <p className="text-sm font-medium">
                {t("settings.taxRates.archived.title")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y rounded-lg border">
                {archivedTaxRates.map((taxRate) => (
                  <TaxRateRowItem key={taxRate.id} taxRate={taxRate} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

function TaxRateRowItem({ taxRate }: { readonly taxRate: TaxRateRow }) {
  const appRun = useAppRun()
  const confirm = useConfirmDialog()
  const { t } = useTranslation()
  const nameInputId = useId()
  const isArchived = taxRate.deactivatedAt !== null
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState<string>(taxRate.name)
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const saveName = async () => {
    const trimmed = name.trim()
    const result = NonEmptyString255Schema.safeParse(trimmed)
    if (!result.success) {
      setNameError("settings.taxRates.name.invalid")
      return
    }

    setPending(true)
    try {
      await using run = appRun()
      await run(renameTaxRate({ id: taxRate.id, name: result.data }))
      setEditing(false)
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Field className="flex-1" data-invalid={nameError !== null}>
          <Input
            id={nameInputId}
            value={name}
            disabled={pending}
            aria-invalid={nameError !== null}
            aria-label={t("settings.taxRates.rename.input", {
              name: taxRate.name,
            })}
            autoComplete="off"
            onChange={(event) => {
              setName(event.currentTarget.value)
              setNameError(null)
            }}
          />
          <FieldError>{nameError ? t(nameError) : null}</FieldError>
        </Field>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            void saveName()
          }}
        >
          {t("settings.taxRates.rename.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setName(taxRate.name)
            setNameError(null)
            setEditing(false)
          }}
        >
          {t("settings.taxRates.rename.cancel")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{taxRate.name}</span>
        <span className="text-xs text-muted-foreground">
          {taxRatePercentageToDecimalString(taxRate.rate)}%
        </span>
      </div>
      <div className="flex items-center gap-1">
        {!isArchived && (
          <Button
            type="button"
            variant={taxRate.isDefault === 1 ? "secondary" : "ghost"}
            size="icon-sm"
            disabled={pending}
            aria-label={
              taxRate.isDefault === 1
                ? t("settings.taxRates.default.unset", { name: taxRate.name })
                : t("settings.taxRates.default.set", { name: taxRate.name })
            }
            onClick={() => {
              void (async () => {
                setPending(true)
                try {
                  await using run = appRun()
                  await run(
                    setDefaultTaxRate(
                      taxRate.isDefault === 1 ? null : taxRate.id
                    )
                  )
                } finally {
                  setPending(false)
                }
              })()
            }}
          >
            <StarIcon
              className={taxRate.isDefault === 1 ? "fill-current" : undefined}
            />
          </Button>
        )}
        {!isArchived && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={t("settings.taxRates.rename", { name: taxRate.name })}
            onClick={() => {
              setEditing(true)
            }}
          >
            <PencilIcon />
          </Button>
        )}
        {isArchived ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={t("settings.taxRates.activate", {
              name: taxRate.name,
            })}
            onClick={() => {
              void (async () => {
                const confirmed = await confirm({
                  title: t("settings.taxRates.activate.confirm.title", {
                    name: taxRate.name,
                  }),
                  description: t(
                    "settings.taxRates.activate.confirm.description",
                    { name: taxRate.name }
                  ),
                  confirmLabel: t("settings.taxRates.activate.confirm.confirm"),
                  cancelLabel: t("settings.taxRates.activate.confirm.cancel"),
                })
                if (!confirmed) return

                setPending(true)
                try {
                  await using run = appRun()
                  await run(activateTaxRate(taxRate.id))
                } finally {
                  setPending(false)
                }
              })()
            }}
          >
            <ArchiveRestoreIcon />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={t("settings.taxRates.archive", {
              name: taxRate.name,
            })}
            onClick={() => {
              void (async () => {
                const confirmed = await confirm({
                  title: t("settings.taxRates.archive.confirm.title", {
                    name: taxRate.name,
                  }),
                  description: t(
                    "settings.taxRates.archive.confirm.description",
                    { name: taxRate.name }
                  ),
                  confirmLabel: t("settings.taxRates.archive.confirm.confirm"),
                  cancelLabel: t("settings.taxRates.archive.confirm.cancel"),
                  variant: "destructive",
                })
                if (!confirmed) return

                setPending(true)
                try {
                  await using run = appRun()
                  await run(archiveTaxRate(taxRate.id))
                } finally {
                  setPending(false)
                }
              })()
            }}
          >
            <ArchiveIcon />
          </Button>
        )}
      </div>
    </div>
  )
}

function NewTaxRateCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const formId = useId()
  const [name, setName] = useState("")
  const [rateInput, setRateInput] = useState("")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [rateError, setRateError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">
          {t("settings.taxRates.add.title")}
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setNameError(null)
            setRateError(null)

            const trimmedName = name.trim()
            const nameResult = NonEmptyString255Schema.safeParse(trimmedName)
            if (!nameResult.success) {
              setNameError("settings.taxRates.name.invalid")
              return
            }

            const rate = decimalStringToTaxRatePercentage(rateInput)
            if (rate === null) {
              setRateError("settings.taxRates.rate.invalid")
              return
            }

            void (async () => {
              setPending(true)
              try {
                await using run = appRun()
                await run(
                  createTaxRate({
                    name: nameResult.data,
                    rate,
                    isDefault: false,
                  })
                )
                setName("")
                setRateInput("")
              } finally {
                setPending(false)
              }
            })()
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameError !== null}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t("settings.taxRates.name.label")}
              </FieldLabel>
              <Input
                id={`${formId}-name`}
                value={name}
                disabled={pending}
                aria-invalid={nameError !== null}
                autoComplete="off"
                placeholder={t("settings.taxRates.name.placeholder")}
                onChange={(event) => {
                  setName(event.currentTarget.value)
                  setNameError(null)
                }}
              />
              <FieldError>{nameError ? t(nameError) : null}</FieldError>
            </Field>

            <Field data-invalid={rateError !== null}>
              <FieldLabel htmlFor={`${formId}-rate`}>
                {t("settings.taxRates.rate.label")}
              </FieldLabel>
              <Input
                id={`${formId}-rate`}
                value={rateInput}
                disabled={pending}
                aria-invalid={rateError !== null}
                autoComplete="off"
                inputMode="decimal"
                placeholder="21"
                onChange={(event) => {
                  setRateInput(event.currentTarget.value)
                  setRateError(null)
                }}
              />
              <FieldDescription>
                {t("settings.taxRates.rate.description")}
              </FieldDescription>
              <FieldError>{rateError ? t(rateError) : null}</FieldError>
            </Field>

            <Button type="submit" disabled={pending}>
              <PlusIcon data-icon="inline-start" />
              {t("settings.taxRates.add")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
