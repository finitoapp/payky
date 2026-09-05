import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { cn } from "@/lib/utils.ts"

export function SearchInput({
  value,
  onChange,
  placeholder,
  clearAriaLabel,
  className,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly clearAriaLabel: string
  readonly className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        className="h-12 bg-card pl-12 text-base"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value !== "" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
          aria-label={clearAriaLabel}
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  )
}
