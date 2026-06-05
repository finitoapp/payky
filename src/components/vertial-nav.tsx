"use client"

import { Link, type LinkProps } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import type React from "react"
import { cn } from "@/lib/utils.ts"

interface NavItem {
  component?: typeof Link
  label: React.ReactNode
  action?: React.ReactNode
  to?: LinkProps["to"]
  href?: string
  params?: LinkProps["params"]
  icon?: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  disableAction?: boolean
}

interface VerticalNavProps {
  items: NavItem[]
  title?: string
  className?: string
}

export function VerticalNav({ items, className, title }: VerticalNavProps) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-md overflow-hidden shadow",
        className
      )}
    >
      {title && (
        <div className={"p-4 font-bold text-xs text-muted-foreground"}>
          {title}
        </div>
      )}
      <nav className={"divide-y"}>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: we don't have any better value
          <NavItemComponent key={index} item={item} />
        ))}
      </nav>
    </div>
  )
}

function NavItemComponent({ item }: { item: NavItem }) {
  const Component = item.component ?? (item.to ? Link : "button")
  const className = cn(
    "text-left",
    "flex w-full items-center gap-3 px-3 py-2 text-sm font-medium transition-all",
    "data-[variant=outline]:border-t-0 data-[variant=outline]:first:border-t",
    "hover:bg-accent/50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
    item.className
  )

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        data-state={item.active ? "on" : "off"}
      >
        <NavItemContent item={item} />
      </a>
    )
  }

  return (
    <Component
      to={item.to}
      params={item.params}
      onClick={item.onClick}
      className={className}
      data-state={item.active ? "on" : "off"}
    >
      <NavItemContent item={item} />
    </Component>
  )
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
