import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import { cashuAccountQuery } from "@/core/modules/account/account-queries.ts"
import { defaultCashuMintUrl } from "@/core/modules/account/account-utils.ts"
import { CashuMintUrlSchema } from "@/core/modules/shared/schema.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useCashuWallet } from "@/hooks/use-cashu-wallet.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"

const cashuBalanceQueryKey = ["cashu", "balance"] as const

export function CashuAccountForm() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const queryClient = useQueryClient()
  const cashuWallet = useCashuWallet()
  const { data: accountData } = useEvoluQuery(cashuAccountQuery)
  const [account] = accountData
  const [enabled, setEnabled] = useState(false)
  const [mintUrl, setMintUrl] = useState<string>(defaultCashuMintUrl)
  const [restorePending, setRestorePending] = useState(false)
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()
  const accountEnabled = account !== undefined && account.isDeleted !== 1

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
    setMintUrl(account?.mintUrl ?? defaultCashuMintUrl)
  }, [account])

  const balanceQuery = useQuery({
    queryKey: [...cashuBalanceQueryKey, account?.id],
    queryFn: () => cashuWallet.getBalances(),
    enabled: accountEnabled,
  })

  // Minted topups and synced proofs change the balance without any action
  // on this screen; the wallet reports them and the query re-reads.
  useEffect(
    () =>
      cashuWallet.subscribeInventory(() => {
        void queryClient.invalidateQueries({ queryKey: cashuBalanceQueryKey })
      }),
    [cashuWallet, queryClient]
  )

  const restoreFromMint = async () => {
    if (account === undefined) return

    setRestorePending(true)
    try {
      const report = await cashuWallet.restore({ mintUrls: [account.mintUrl] })
      await queryClient.invalidateQueries({ queryKey: cashuBalanceQueryKey })
      if (report.unavailableMints.length > 0) {
        toast.error(t("settings.cashuAccount.restore.unavailable"))
        return
      }
      toast.success(
        t("settings.cashuAccount.restore.success", {
          amount: formatSatsAmount(report.restoredSats, locale),
          count: report.restoredProofs,
        })
      )
    } catch {
      toast.error(t("settings.cashuAccount.restore.error"))
    } finally {
      setRestorePending(false)
    }
  }

  const balanceText = balanceQuery.isError
    ? t("settings.cashuAccount.balance.error")
    : balanceQuery.data === undefined
      ? t("settings.cashuAccount.balance.loading")
      : t("settings.cashuAccount.balance.label", {
          amount: formatSatsAmount(balanceQuery.data.totalSats, locale),
        })

  return (
    <SettingsFormCard
      title={t("settings.cashuAccount.form.title")}
      description={t("settings.cashuAccount.form.description")}
      savedMessage={saved ? t("settings.cashuAccount.saved") : null}
      submitLabel={t("settings.cashuAccount.save")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        resetSaved()

        const mintUrlResult = CashuMintUrlSchema.safeParse(mintUrl)
        if (!mintUrlResult.success) {
          setError("settings.cashuAccount.mintUrl.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()

          await run(saveCashuAccount({ enabled, mintUrl: mintUrlResult.data }))
          setMintUrl(mintUrlResult.data)
        })
      }}
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={`${formId}-enabled`}
            checked={enabled}
            disabled={pending}
            onCheckedChange={(checked) => {
              setEnabled(checked)
              resetSaved()
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${formId}-enabled`}>
              {t("settings.cashuAccount.enabled.label")}
            </FieldLabel>
            <FieldDescription>
              {t("settings.cashuAccount.enabled.description")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={`${formId}-mintUrl`}>
            {t("settings.cashuAccount.mintUrl.label")}
          </FieldLabel>
          <Input
            id={`${formId}-mintUrl`}
            value={mintUrl}
            disabled={pending}
            aria-invalid={error !== null}
            autoComplete="off"
            inputMode="url"
            onChange={(event) => {
              setMintUrl(event.currentTarget.value)
              setError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.cashuAccount.mintUrl.description")}
          </FieldDescription>
          <FieldError>{error ? t(error) : null}</FieldError>
        </Field>

        {accountEnabled ? (
          <Field>
            <p className="text-sm font-medium tabular-nums" aria-live="polite">
              {balanceText}
            </p>
            <FieldDescription>
              {t("settings.cashuAccount.restore.description")}
            </FieldDescription>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={pending || restorePending}
              onClick={() => void restoreFromMint()}
            >
              {restorePending
                ? t("settings.cashuAccount.restore.pending")
                : t("settings.cashuAccount.restore.action")}
            </Button>
          </Field>
        ) : null}
      </FieldGroup>
    </SettingsFormCard>
  )
}
