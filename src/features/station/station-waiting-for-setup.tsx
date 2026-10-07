import { useAtomValue } from "jotai"
import { LoaderCircleIcon, LogOutIcon } from "lucide-react"

import { accountAtom } from "@/atoms/account.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { Button } from "@/components/ui/button.tsx"
import { getStationNostrPubkey } from "@/core/modules/station/station-identity-utils.ts"
import { useLeaveStation } from "@/features/station/use-leave-station.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * A station before the owner's first config arrives: nothing to sell with
 * yet, so it waits, and offers a way out for a link opened by mistake.
 */
export function StationWaitingForSetup() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const leaveStation = useLeaveStation()
  const pubkey = getStationNostrPubkey(account.masterKey)

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="justify-center px-5 py-6">
        <div
          className="flex flex-col items-center gap-4 text-center"
          aria-live="polite"
        >
          <LoaderCircleIcon
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold">
            {t("station.waiting.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("station.waiting.description")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("station.waiting.id")}{" "}
            <span className="font-mono">
              {pubkey.slice(0, 8)}…{pubkey.slice(-8)}
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void leaveStation()
            }}
          >
            <LogOutIcon data-icon="inline-start" />
            {t("station.leave.action")}
          </Button>
        </div>
      </PhoneViewport>
    </main>
  )
}
