import { CheckIcon } from "lucide-react"
import type { ReactNode } from "react"

export function PaymentSuccess({
  actions,
  description,
  title,
}: {
  readonly actions?: ReactNode
  readonly description?: string
  readonly title: string
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex size-24 items-center justify-center rounded-full bg-green-500 text-[#071012]">
        <CheckIcon className="size-14" strokeWidth={3} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-3xl font-semibold">{title}</p>
        {description === undefined ? null : (
          <p className="max-w-72 text-balance text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions}
    </div>
  )
}
