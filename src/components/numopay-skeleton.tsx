import { Link } from "@tanstack/react-router"
import { ChevronLeft, X } from "lucide-react"
import type * as React from "react"
import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button.tsx"
import type { VerticalNav } from "@/components/vertial-nav.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"
import { cn } from "@/lib/utils.ts"

export type VerticalNavItem = ComponentProps<
  typeof VerticalNav
>["items"][number]

export function PhoneViewport({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  )
}

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
      render={<Link aria-label={t("nav.back")} to={to} />}
    >
      <BackIcon />
    </Button>
  )
}
