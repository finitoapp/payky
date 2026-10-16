import { useRegisterSW } from "virtual:pwa-register/react"
import { useEffect } from "react"
import { toast } from "sonner"

import { useTranslation } from "@/hooks/use-translation.ts"

const updateToastId = "pwa-update"

export function PwaUpdateToast() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!needRefresh) {
      return
    }

    toast(t("appUpdate.available"), {
      id: updateToastId,
      description: t("appUpdate.description"),
      duration: Infinity,
      action: {
        label: t("appUpdate.action"),
        onClick: () => {
          void updateServiceWorker()
        },
      },
    })
  }, [needRefresh, t, updateServiceWorker])

  return null
}
