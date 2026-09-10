import { useAtomValue } from "jotai"
import { LifeBuoyIcon, UserRoundIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { accountAtom, recoveryMnemonicAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { accountListQuery, selectAccount } from "@/core/evolu/device-account.ts"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import {
  createEvoluExportFilename,
  saveEvoluExportFile,
} from "@/features/settings/evolu-export/evolu-export-utils.ts"
import { RecoveryPhraseCard } from "@/features/settings/security/recovery-phrase-card.tsx"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The way back when the active account's app database won't open: every
 * other surface that can switch accounts or show a recovery phrase lives
 * under `/_terminal`, which gates on the app database that is precisely
 * what has failed.
 *
 * So this page must depend on the *device* database and nothing else — no
 * `useEvolu`, no `useAppRun`, no domain module that touches app tables. Keep
 * it that way; an app-Evolu import here is what would make the escape hatch
 * fail exactly when it is needed.
 */
export function RecoveryPage() {
  const { language, t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const recoveryMnemonic = useAtomValue(recoveryMnemonicAtom)
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const [pending, setPending] = useState(false)

  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  const switchAccount = async (accountId: AccountId) => {
    setPending(true)
    try {
      await runMutationWithCompletion((options) =>
        selectAccount(deviceEvolu, accountId, options)
      )
      // A full reload, not `reloadAppEvolu()`: the client this page exists
      // to escape may be half-open or stuck, and a fresh boot is the one
      // state known to be clean. Awaited above so the write is committed
      // before the page goes away.
      window.location.assign("/")
    } catch {
      setPending(false)
      toast.error(t("recovery.switch.error"))
    }
  }

  const exportDeviceDatabase = async () => {
    setPending(true)
    try {
      const bytes = await deviceEvolu.exportDatabase()
      await saveEvoluExportFile({
        database: "device",
        bytes,
        filename: createEvoluExportFilename({
          createdAt: new Date(),
          database: "device",
        }),
      })
      toast.success(t("settings.evoluExport.status.success"))
    } catch {
      toast.error(t("settings.evoluExport.status.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 px-3 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LifeBuoyIcon className="size-5" aria-hidden="true" />
        </div>
        <h1 className="font-semibold text-2xl leading-tight">
          {t("recovery.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("recovery.description")}
        </p>
      </div>

      <RecoveryPhraseCard mnemonic={recoveryMnemonic} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.accounts.list.title")}</CardTitle>
          <CardDescription>
            {t("recovery.accounts.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.accounts.list.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="account-list">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {account.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("settings.accounts.list.createdAt")}{" "}
                      {dateFormatter.format(new Date(account.createdAt))}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {account.id === activeAccount.id ? (
                      <Badge variant="secondary">
                        {t("settings.accounts.list.active")}
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          void switchAccount(account.id)
                        }}
                      >
                        <UserRoundIcon data-icon="inline-start" />
                        {t("settings.accounts.list.switch")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.evoluExport.database.device")}</CardTitle>
          <CardDescription>{t("recovery.export.description")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              void exportDeviceDatabase()
            }}
          >
            {t("settings.evoluExport.action")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
