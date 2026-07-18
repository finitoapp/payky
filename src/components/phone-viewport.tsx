import type * as React from "react"

import { cn } from "@/lib/utils.ts"

export function PhoneViewport({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={
        "min-h-svh flex pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      }
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-xl flex-col gap-6 overflow-hidden",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
