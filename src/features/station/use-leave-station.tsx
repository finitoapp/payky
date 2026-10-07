import { useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { removeDeviceAccount } from "@/core/evolu/device-account.ts"
import { stationOutboxStatusQuery } from "@/core/modules/station/station-queries.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Leaves PoS mode after a confirm that warns about payments the owner has
 * not received: the station account goes, and the device falls back to its
 * most recently used account. Anyone at the station may do this.
 */
export function useLeaveStation() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const account = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const [outbox] = useEvoluQuery(stationOutboxStatusQuery).data
  const undelivered = outbox?.undeliveredPaymentCount ?? 0

  return async () => {
    const confirmed = await confirm({
      title: t("station.leave.confirm.title"),
      description: (
        <>
          {t("station.leave.confirm.description")}
          {undelivered > 0 ? (
            <span className="mt-2 block font-medium text-destructive">
              {t("station.leave.confirm.undelivered", { count: undelivered })}
            </span>
          ) : null}
        </>
      ),
      confirmLabel: t("station.leave.confirm.confirm"),
      cancelLabel: t("station.leave.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    removeDeviceAccount(deviceEvolu, account.id)
    reloadAppEvolu()
    await navigate({ to: "/", replace: true })
  }
}
