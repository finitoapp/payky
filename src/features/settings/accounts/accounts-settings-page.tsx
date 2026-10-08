import { useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { Check, MonitorSmartphone, Trash2 } from "lucide-react"
import { useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  VerticalNav,
  verticalNavShellClassName,
  verticalNavTitleClassName,
} from "@/components/vertical-nav.tsx"
import {
  accountListQuery,
  createAccountMasterKey,
  createOrSelectAccount,
  removeDeviceAccount,
  selectAccount,
} from "@/core/evolu/device-account.ts"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { AccountTransferTarget } from "@/features/account/account-transfer-target.tsx"
import {
  type AccountChoice,
  AccountTypeChoice,
} from "@/features/account/account-type-choice.tsx"
import { RestoreAccountForm } from "@/features/account/restore-account-form.tsx"
import { useRestoreAccount } from "@/features/account/use-restore-account.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Three questions, one section each: which accounts this device has (and
 * which one is active), how to add another — the same choice onboarding
 * offers — and how to open this one on another device.
 */
export function AccountsSettingsPage() {
  const { language, t } = useTranslation()
  const navigate = useNavigate()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const confirm = useConfirmDialog()
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const [busy, setBusy] = useState(false)
  // The kind outlives `dialogOpen`, so the content stays while it animates out.
  const [dialog, setDialog] = useState<"restore" | "transfer">("restore")
  const [dialogOpen, setDialogOpen] = useState(false)
  const {
    mnemonic,
    pending: restoring,
    error,
    clearError,
    setMnemonic,
    restore,
  } = useRestoreAccount()
  const pending = busy || restoring

  const activateAccount = (accountId: AccountId) => {
    if (accountId === activeAccount.id) return
    selectAccount(deviceEvolu, accountId)
    reloadAppEvolu()
  }

  const removeAccount = async (accountId: AccountId, name: string) => {
    if (accountId === activeAccount.id) return

    // Confirmed because there is no undo: the row is only soft-deleted, every
    // query filters it out, and the only way back is re-entering the recovery
    // phrase. `insertAccount` activates the default relays, so a copy may sit
    // there — but reaching it still needs that same phrase.
    const confirmed = await confirm({
      title: t("settings.accounts.remove.confirm.title", { name }),
      description: t("settings.accounts.remove.confirm.description"),
      confirmLabel: t("settings.accounts.remove.confirm.confirm"),
      cancelLabel: t("settings.accounts.remove.confirm.cancel"),
      variant: "destructive",
    })
    if (confirmed) removeDeviceAccount(deviceEvolu, accountId)
  }

  const createNewAccount = async () => {
    const confirmed = await confirm({
      title: t("settings.accounts.create.confirm.title"),
      description: t("settings.accounts.create.confirm.description", {
        name: activeAccount.name,
      }),
      confirmLabel: t("settings.accounts.create.confirm.confirm"),
      cancelLabel: t("settings.accounts.create.confirm.cancel"),
    })
    if (!confirmed) return

    setBusy(true)
    try {
      await createOrSelectAccount(deviceEvolu, createAccountMasterKey())
      reloadAppEvolu()
    } finally {
      setBusy(false)
    }
  }

  const restoreAccount = async () => {
    const restored = await restore()
    if (restored === null) return
    setDialogOpen(false)
    await navigate({
      to: "/restore-account",
      search: { source: "settings", ...restored },
    })
  }

  const chooseAccountType = (choice: AccountChoice) => {
    if (choice === "new") {
      void createNewAccount()
      return
    }
    clearError()
    setDialog(choice)
    setDialogOpen(true)
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.accounts.title")} />
      <div className="flex flex-col gap-6">
        <section className={verticalNavShellClassName}>
          <h2 className={verticalNavTitleClassName}>
            {t("settings.accounts.list.title")}
          </h2>
          {accounts.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("settings.accounts.list.empty")}
            </p>
          ) : (
            <ul className="divide-y" data-testid="account-list">
              {accounts.map((account) => {
                const active = account.id === activeAccount.id

                return (
                  <li
                    key={account.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      active && "bg-primary/5"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full font-semibold uppercase",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {account.name.slice(0, 1)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {account.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("settings.accounts.list.createdAt")}{" "}
                        {formatDateTime(new Date(account.createdAt), language)}
                      </span>
                    </span>
                    {active ? (
                      <Badge variant="secondary">
                        <Check data-icon="inline-start" />
                        {t("settings.accounts.list.active")}
                      </Badge>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => activateAccount(account.id)}
                        >
                          {t("settings.accounts.list.switch")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={t("settings.accounts.list.remove")}
                          onClick={() => {
                            void removeAccount(account.id, account.name)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <AccountTypeChoice
          title={t("settings.accounts.add.title")}
          pending={pending}
          onSelect={chooseAccountType}
        />

        <VerticalNav
          title={t("settings.accounts.elsewhere.title")}
          items={[
            {
              id: "transfer",
              kind: "link",
              to: "/settings/accounts/transfer",
              icon: <MonitorSmartphone className="text-muted-foreground" />,
              label: (
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {t("accountTransfer.settings.source.title")}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t("accountTransfer.settings.source.description")}
                  </span>
                </span>
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!restoring) setDialogOpen(open)
        }}
      >
        <DialogContent>
          {dialog === "restore" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("accountChoice.restore.title")}</DialogTitle>
                <DialogDescription>
                  {t("onboarding.restore.description")}
                </DialogDescription>
              </DialogHeader>
              <RestoreAccountForm
                error={error}
                mnemonic={mnemonic}
                pending={restoring}
                onMnemonicChange={setMnemonic}
                onRestore={() => {
                  void restoreAccount()
                }}
              />
            </>
          ) : null}
          {dialog === "transfer" && dialogOpen ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("accountTransfer.target.title")}</DialogTitle>
                <DialogDescription>
                  {t("accountTransfer.target.description")}
                </DialogDescription>
              </DialogHeader>
              <AccountTransferTarget
                source="settings"
                confirmBeforeAdding
                onRestoreWithPhrase={() => setDialog("restore")}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
