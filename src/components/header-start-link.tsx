import { Link } from "@tanstack/react-router"
import { ChevronLeft, X } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import type { VerticalNavItem } from "@/components/vertical-nav.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function HeaderStartLink({
  to,
  close = false,
}: {
  readonly to: VerticalNavItem["to"]
  readonly close?: boolean
}) {
  const { t } = useTranslation()
  const BackIcon = close ? X : ChevronLeft

  return (
    <Button
      variant="ghost"
      nativeButton={false}
      render={<Link aria-label={t("nav.back")} to={to} />}
    >
      <BackIcon />
    </Button>
  )
}
