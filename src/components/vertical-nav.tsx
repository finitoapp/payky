"use client"

import { Link, type LinkProps } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import type React from "react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils.ts"

export type NavLinkTo = LinkProps["to"]

/**
 * The card shell a `VerticalNav` draws. Exported because the loading
 * placeholders that stand in for one (`ListSkeleton`,
 * `ActivityHistorySkeleton`) have to match it exactly — copying the classes
 * lets the real list and its placeholder drift apart unnoticed.
 */
export const verticalNavShellClassName =
  "bg-card flex flex-col rounded-md overflow-hidden shadow"

type NavItemTarget =
  | {
      readonly kind: "link"
      readonly to: NavLinkTo
      readonly params?: LinkProps["params"]
    }
  | { readonly kind: "href"; readonly href: string }
  | { readonly kind: "button"; readonly onClick?: () => void }

type NavItem = NavItemTarget & {
  /** Stable identity for list reconciliation; falls back to array index when omitted. */
  readonly id?: string
  readonly label: React.ReactNode
  readonly action?: React.ReactNode
  readonly icon?: React.ReactNode
  readonly className?: string
  readonly disableAction?: boolean
}

interface VerticalNavProps {
  readonly items: ReadonlyArray<NavItem>
  readonly empty?: React.ReactNode
  readonly title?: string
  readonly className?: string
}

export type VerticalNavItem = ComponentProps<
  typeof VerticalNav
>["items"][number]

export function VerticalNav({
  items,
  empty,
  className,
  title,
}: VerticalNavProps) {
  return (
    <div className={cn(verticalNavShellClassName, className)}>
      {title && (
        <div className={"p-4 font-bold text-xs text-muted-foreground"}>
          {title}
        </div>
      )}
      <nav className={"divide-y"}>
        {items.length === 0 && empty !== undefined ? (
          <NavItemComponent
            item={{ kind: "button", disableAction: true, label: empty }}
          />
        ) : (
          items.map((item, index) => (
            <NavItemComponent key={item.id ?? index} item={item} />
          ))
        )}
      </nav>
    </div>
  )
}

function NavItemComponent({ item }: { item: NavItem }) {
  const className = cn(
    "text-left",
    "flex w-full items-center gap-3 px-3 py-2 text-sm font-medium transition-all",
    "hover:bg-accent/50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    item.className
  )

  switch (item.kind) {
    case "href":
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={className}
        >
          <NavItemContent item={item} />
        </a>
      )
    case "link":
      return (
        <Link to={item.to} params={item.params} className={className}>
          <NavItemContent item={item} />
        </Link>
      )
    case "button":
      return (
        <button type="button" onClick={item.onClick} className={className}>
          <NavItemContent item={item} />
        </button>
      )
  }
}

function NavItemContent({ item }: { item: NavItem }) {
  return (
    <div className={"p-1 flex w-full items-center"}>
      <div className="flex items-center gap-3 w-full p-0.5">
        {item.icon}
        <span className={"w-full"}>{item.label}</span>
        {!item.disableAction && (
          <div className={"pl-2"}>
            {item.action ? item.action : <ChevronRight className="h-4 w-4" />}
          </div>
        )}
      </div>
    </div>
  )
}
