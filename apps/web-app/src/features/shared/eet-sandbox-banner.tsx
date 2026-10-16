import { Link } from "@tanstack/react-router"
import { FlaskConicalIcon } from "lucide-react"

import { useTranslation } from "@/hooks/use-translation.ts"

export function EetSandboxBanner() {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-background px-3 pt-[env(safe-area-inset-top,0px)]">
      <Link
        to="/settings/eet"
        className="mx-auto flex h-(--terminal-banner-height) max-w-xl items-center gap-2 rounded-b-lg border border-t-0 border-warning/30 bg-warning/10 px-3 text-xs font-medium text-warning"
        data-testid="eet-sandbox-banner"
      >
        <FlaskConicalIcon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{t("eet.sandbox.banner")}</span>
      </Link>
    </div>
  )
}
