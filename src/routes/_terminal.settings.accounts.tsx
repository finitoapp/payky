import { Mnemonic } from "@evolu/common"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { Check, KeyRound, Plus, Trash2, UserRound } from "lucide-react"
import { useId, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  accountListQuery,
  createAccountMnemonic,
  createOrSelectAccount,
  removeDeviceAccount,
  selectAccount,
} from "@/core/evolu/device-account.ts"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/accounts")({
  component: AccountsSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function AccountsSettingsPage() {
  const { language, t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const setEvoluCounter = useSetAtom(evoluCounterAtom)
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const [mnemonic, setMnemonic] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [status, setStatus] = useState<TranslationKey | null>(null)
  const [pendingAccountId, setPendingAccountId] = useState<AccountId | null>(
    null
  )
  const [removingAccountId, setRemovingAccountId] = useState<AccountId | null>(
    null
  )
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const mnemonicInputId = useId()

  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  const reloadAppAccount = () => {
    setEvoluCounter((current) => current + 1)
  }

  const activateAccount = (accountId: AccountId) => {
    if (accountId === activeAccount.id) {
      return
    }

    setPendingAccountId(accountId)
    try {
      selectAccount(deviceEvolu, accountId)
      reloadAppAccount()
    } finally {
      setPendingAccountId(null)
    }
  }

  const removeAccount = (accountId: AccountId) => {
    if (accountId === activeAccount.id) {
      return
    }

    setRemovingAccountId(accountId)
    try {
      removeDeviceAccount(deviceEvolu, accountId)
    } finally {
      setRemovingAccountId(null)
    }
  }

  const createNewAccount = async () => {
    setError(null)
    setStatus(null)
    setCreating(true)
    try {
      await createOrSelectAccount(deviceEvolu, createAccountMnemonic())
      reloadAppAccount()
    } finally {
      setCreating(false)
    }
  }

  const restoreAccount = async () => {
    setError(null)
    setStatus(null)

    const normalizedMnemonic = normalizeMnemonic(mnemonic)

    if (normalizedMnemonic === "") {
      setError("settings.accounts.restore.mnemonic.required")
      return
    }

    const mnemonicResult = Mnemonic.from(normalizedMnemonic)

    if (!mnemonicResult.ok) {
      setError("settings.accounts.restore.mnemonic.invalid")
      return
    }

    setRestoring(true)
    try {
      const result = await createOrSelectAccount(
        deviceEvolu,
        mnemonicResult.value
      )
      setMnemonic(normalizedMnemonic)
      setStatus(
        result.created
          ? "settings.accounts.restore.created"
          : "settings.accounts.restore.existing"
      )
      reloadAppAccount()
    } finally {
      setRestoring(false)
    }
  }

  const pending =
    pendingAccountId !== null ||
    removingAccountId !== null ||
    creating ||
    restoring

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.accounts.title")} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.accounts.list.title")}</CardTitle>
            <CardDescription>
              {t("settings.accounts.list.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.accounts.list.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
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
                      ) : null}
                      <Button
                        type="button"
                        variant={
                          account.id === activeAccount.id
                            ? "secondary"
                            : "outline"
                        }
                        size="sm"
                        disabled={pending || account.id === activeAccount.id}
                        onClick={() => {
                          activateAccount(account.id)
                        }}
                      >
                        {account.id === activeAccount.id ? (
                          <Check data-icon="inline-start" />
                        ) : (
                          <UserRound data-icon="inline-start" />
                        )}
                        {account.id === activeAccount.id
                          ? t("settings.accounts.list.current")
                          : t("settings.accounts.list.switch")}
                      </Button>
                      {account.id !== activeAccount.id ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            removeAccount(account.id)
                          }}
                        >
                          <Trash2 data-icon="inline-start" />
                          {t("settings.accounts.list.remove")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.accounts.create.title")}</CardTitle>
            <CardDescription>
              {t("settings.accounts.create.description")}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-end">
            <Button type="button" disabled={pending} onClick={createNewAccount}>
              <Plus data-icon="inline-start" />
              {t("settings.accounts.create.action")}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.accounts.restore.title")}</CardTitle>
            <CardDescription>
              {t("settings.accounts.restore.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void restoreAccount()
              }}
            >
              <FieldGroup>
                <Field data-invalid={error !== null}>
                  <FieldLabel htmlFor={mnemonicInputId}>
                    {t("settings.accounts.restore.mnemonic.label")}
                  </FieldLabel>
                  <PasswordTextarea
                    id={mnemonicInputId}
                    value={mnemonic}
                    disabled={pending}
                    aria-invalid={error !== null}
                    autoComplete="off"
                    placeholder={t(
                      "settings.accounts.restore.mnemonic.placeholder"
                    )}
                    onChange={(event) => {
                      setMnemonic(event.currentTarget.value)
                      setError(null)
                      setStatus(null)
                    }}
                  />
                  <FieldDescription>
                    {t("settings.accounts.restore.mnemonic.description")}
                  </FieldDescription>
                  <FieldError>{error ? t(error) : null}</FieldError>
                </Field>
              </FieldGroup>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {status ? t(status) : null}
                </p>
                <Button type="submit" disabled={pending}>
                  <KeyRound data-icon="inline-start" />
                  {t("settings.accounts.restore.action")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
