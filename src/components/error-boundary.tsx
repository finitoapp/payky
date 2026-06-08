import type { ErrorComponentProps } from "@tanstack/react-router"
import { AlertTriangleIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function AppErrorBoundary({
  error,
  info,
  reset,
}: ErrorComponentProps<unknown>) {
  const { t } = useTranslation()
  const detail = formatErrorDetail(error, info?.componentStack)
  const errorName = error instanceof Error ? error.name : t("appError.unknown")
  const errorMessage =
    error instanceof Error ? error.message : t("appError.nonError")

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl border-destructive/30 bg-card/95 shadow-xl">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-5" aria-hidden="true" />
          </div>
          <CardTitle>{t("appError.title")}</CardTitle>
          <CardDescription>{t("appError.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="font-medium text-muted-foreground">
              {t("appError.name")}
            </dt>
            <dd className="break-words font-mono">{errorName}</dd>
            <dt className="font-medium text-muted-foreground">
              {t("appError.message")}
            </dt>
            <dd className="break-words font-mono">{errorMessage}</dd>
          </dl>
          <Collapsible className="flex flex-col gap-2">
            <CollapsibleTrigger
              render={
                <Button
                  className="group/error-detail-trigger w-full justify-between"
                  variant="outline"
                />
              }
            >
              {t("appError.details")}
              <ChevronDownIcon
                data-icon="inline-end"
                className="transition-transform group-data-[panel-open]/error-detail-trigger:rotate-180"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent keepMounted>
              <pre className="max-h-[50svh] overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {detail}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={reset}>
            {t("appError.tryAgain")}
          </Button>
          <Button onClick={() => window.location.reload()}>
            {t("appError.reload")}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

function formatErrorDetail(
  error: unknown,
  componentStack: string | undefined
): string {
  const errorDetail =
    error instanceof Error
      ? [error.stack, error.message, error.name].find(
          (value) => value && value.trim().length > 0
        )
      : stringifyUnknown(error)

  return [errorDetail, componentStack]
    .filter((value): value is string => Boolean(value))
    .join("\n\nComponent stack:\n")
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
