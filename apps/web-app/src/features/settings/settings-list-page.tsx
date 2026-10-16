import { Link, type LinkProps } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import type { ReactNode } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"

/**
 * The frame every settings list screen shares: a title and a "+" link to the
 * create route.
 *
 * The body itself stays with each feature, and so do its Suspense
 * boundaries — each body keeps its search input outside of them, so only the
 * rows show a skeleton while loading. What it has to load genuinely
 * differs — the catalog item screen also renders a category filter bar, and
 * decides whether the list is empty at all from a different query than the
 * category and table screens use.
 */
export function SettingsListPage({
  title,
  addAriaLabel,
  addTo,
  children,
}: {
  readonly title: string
  readonly addAriaLabel: string
  readonly addTo: LinkProps["to"]
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-6" />
      <FadeHeader
        title={title}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link aria-label={addAriaLabel} to={addTo} />}
          >
            <PlusIcon className="text-primary size-5" strokeWidth={3} />
          </Button>
        }
      />

      {children}
    </div>
  )
}
