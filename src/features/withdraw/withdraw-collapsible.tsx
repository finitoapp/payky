import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"

/** A closed-by-default section for what most merchants never need to read. */
export function WithdrawCollapsible({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group/withdraw-more flex w-full items-center justify-between text-left text-sm font-medium">
        {label}
        <ChevronDown
          className="size-4 transition-transform group-data-[panel-open]/withdraw-more:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden h-(--collapsible-panel-height) transition-[height] duration-200 ease-out data-starting-style:h-0 data-ending-style:h-0">
        <div className="flex min-h-0 flex-col gap-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
