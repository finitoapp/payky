import { useOnline, useTimestamp } from "@dedalik/use-react"
import { useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  KeyRound,
  LoaderCircleIcon,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useEffect, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  removeDeviceAccount,
  selectAccount,
} from "@/core/evolu/device-account.ts"
import {
  evaluateInitialSync,
  type InitialSyncOutcome,
  isRelaySyncing,
} from "@/core/evolu/initial-sync-state.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  initialOnboardingFormState,
  onboardingFormAtom,
} from "@/features/onboarding/onboarding-form-state.ts"
import {
  planRestoreCleanup,
  restoredAccountAtom,
} from "@/features/shared/account/restored-account.ts"
import { TransportAddForm } from "@/features/shared/evolu-transports/transport-add-form.tsx"
import { TransportToggleList } from "@/features/shared/evolu-transports/transport-toggle-list.tsx"
import { useAppOwnerSyncState } from "@/hooks/use-app-owner-sync-state.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const outcomePresentation = {
  waiting: {
    title: "accountRestore.title",
    description: "accountRestore.description",
  },
  restored: {
    title: "accountRestore.title",
    description: "accountRestore.description",
  },
  empty: {
    title: "accountRestore.empty.title",
    description: "accountRestore.empty.description",
  },
  failed: {
    title: "accountRestore.failed.title",
    description: "accountRestore.failed.description",
  },
} satisfies Record<
  InitialSyncOutcome,
  { readonly title: TranslationKey; readonly description: TranslationKey }
>

/**
 * Evaluates the restored account's first sync, keeping the idle clock that
 * `evaluateInitialSync` needs: it restarts whenever a relay starts or stops
 * syncing, and on `restart`.
 */
function useInitialSyncOutcome(hasSettings: boolean) {
  const relays = useAppOwnerSyncState()
  const online = useOnline()
  const now = useTimestamp({ interval: 1000 })
  const syncing = relays?.some(isRelaySyncing) === true
  const [idle, setIdle] = useState(() => ({ syncing, since: Date.now() }))
  if (idle.syncing !== syncing) {
    setIdle({ syncing, since: Date.now() })
  }

  // Relay statuses flip within moments of each other while a sync starts or
  // ends; settling the outcome keeps a transient mix from flashing an error.
  const outcome = useDebouncedValue(
    evaluateInitialSync({
      relays,
      hasSettings,
      online,
      idleForMs: now - idle.since,
    }),
    400
  )

  return {
    outcome,
    online,
    restart: () => {
      setIdle({ syncing, since: Date.now() })
    },
  }
}

interface RestoreSyncPageProps {
  /** Where the restore started, and so where "use another phrase" returns. */
  readonly source: "onboarding" | "settings"
}

/**
 * Waits for a restored account's first sync and decides what it found: the
 * account's settings (go home), relays that synced but hold nothing, or
 * relays that could not be synced with. The last two let the merchant fix the
 * relay list, try another phrase, or set this one up as a new account.
 */
export function RestoreSyncPage({ source }: RestoreSyncPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const account = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const confirm = useConfirmDialog()
  const setOnboardingForm = useSetAtom(onboardingFormAtom)
  const { data } = useEvoluQuery(settingsQuery)
  const hasSettings = data[0] !== undefined
  const { outcome, online, restart } = useInitialSyncOutcome(hasSettings)
  const [addingRelay, setAddingRelay] = useState(false)
  const settled = outcome === "empty" || outcome === "failed"

  // Taken once and the atom emptied, so the restore is cleaned up after at
  // most once: a later visit to this URL finds nothing to remove or select.
  const [restoredAccount, setRestoredAccount] = useAtom(restoredAccountAtom)
  const [restored] = useState(() => restoredAccount)
  useEffect(() => {
    setRestoredAccount(null)
  }, [setRestoredAccount])
  const cleanup = planRestoreCleanup({
    restored,
    activeAccountId: account.id,
    source,
  })
  const previousToDiscard = cleanup.discardOnSuccess

  useEffect(() => {
    if (!hasSettings) return
    if (previousToDiscard !== undefined) {
      removeDeviceAccount(deviceEvolu, previousToDiscard)
    }
    void navigate({ to: "/", replace: true })
  }, [deviceEvolu, navigate, previousToDiscard, hasSettings])

  const retry = () => {
    reloadAppEvolu()
    restart()
  }

  const switchToAnotherPhrase = () => {
    if (cleanup.removeOnCancel !== undefined) {
      removeDeviceAccount(deviceEvolu, cleanup.removeOnCancel)
    }
    if (cleanup.selectOnCancel !== undefined) {
      selectAccount(deviceEvolu, cleanup.selectOnCancel)
    }
    if (source === "onboarding") {
      setOnboardingForm({
        ...initialOnboardingFormState,
        accountType: "restore",
        step: "restore",
      })
    }
    reloadAppEvolu()
    void navigate({
      to: source === "onboarding" ? "/onboarding" : "/settings/accounts",
      replace: true,
    })
  }

  const setUpAsNew = async () => {
    // Relays that synced empty hold nothing to lose; one that could not be
    // reached may still hold the account, which a later sync would then
    // overwrite with whatever onboarding writes now (last write wins).
    if (outcome === "failed") {
      const confirmed = await confirm({
        title: t("accountRestore.setupNew.confirm.title"),
        description: t("accountRestore.setupNew.confirm.description"),
        confirmLabel: t("accountRestore.setupNew.confirm.confirm"),
        cancelLabel: t("accountRestore.setupNew.confirm.cancel"),
        variant: "destructive",
      })
      if (!confirmed) return
    }

    if (previousToDiscard !== undefined) {
      removeDeviceAccount(deviceEvolu, previousToDiscard)
    }
    setOnboardingForm({
      ...initialOnboardingFormState,
      accountType: "existingMnemonic",
      step: "countryCurrency",
    })
    await navigate({ to: "/onboarding", replace: true })
  }

  const { title, description } = outcomePresentation[outcome]

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="justify-center px-5 py-6">
        <div className="flex flex-col gap-5">
          <div
            className="flex flex-col items-center gap-3 text-center"
            aria-live="polite"
          >
            {settled ? (
              <TriangleAlert
                className="size-8 text-destructive"
                aria-hidden="true"
              />
            ) : (
              <LoaderCircleIcon
                className="size-8 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <h1 className="font-semibold text-2xl leading-tight">{t(title)}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                outcome === "failed" && !online
                  ? "accountRestore.failed.offline"
                  : description
              )}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("accountRestore.relays.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TransportToggleList accountId={account.id} />
              {settled && addingRelay ? (
                <TransportAddForm accountId={account.id} />
              ) : null}
              {settled && !addingRelay ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setAddingRelay(true)
                  }}
                >
                  <Plus data-icon="inline-start" />
                  {t("accountRestore.action.addRelay")}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            {settled ? (
              <Button type="button" onClick={retry}>
                <RefreshCw data-icon="inline-start" />
                {t("accountRestore.action.retry")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={switchToAnotherPhrase}
            >
              <KeyRound data-icon="inline-start" />
              {t("accountRestore.action.otherPhrase")}
            </Button>
            {settled ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void setUpAsNew()}
              >
                {t("accountRestore.action.setupNew")}
              </Button>
            ) : null}
          </div>
        </div>
      </PhoneViewport>
    </main>
  )
}
