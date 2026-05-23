import type { ConsoleEntry } from "@evolu/common"
import { createFileRoute } from "@tanstack/react-router"
import { Pause, Play, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { useConsoleHistory } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_terminal/settings/debug-console")({
  component: DebugConsolePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function DebugConsolePage() {
  const { t } = useTranslation()
  const consoleHistory = useConsoleHistory()
  const [isPaused, setIsPaused] = useState(false)
  const [entries, setEntries] = useState<ReadonlyArray<ConsoleEntry>>(() =>
    consoleHistory.getEntries()
  )
  const visibleEntries = useMemo(() => entries.toReversed(), [entries])

  useEffect(() => {
    if (isPaused) return

    setEntries(consoleHistory.getEntries())

    return consoleHistory.subscribe(() => {
      setEntries(consoleHistory.getEntries())
    })
  }, [consoleHistory, isPaused])

  const clearEntries = () => {
    consoleHistory.clearEntries()
    setEntries([])
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.debugConsole.title")} />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("settings.debugConsole.history.title")}</CardTitle>
          <CardAction>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsPaused((value) => !value)
                }}
              >
                {isPaused ? <Play /> : <Pause />}
                {isPaused
                  ? t("settings.debugConsole.resume")
                  : t("settings.debugConsole.pause")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearEntries}
                disabled={entries.length === 0}
              >
                <Trash2 />
                {t("settings.debugConsole.clear")}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("settings.debugConsole.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visibleEntries.map((entry, index) => (
                <ConsoleEntryCard
                  // biome-ignore lint/suspicious/noArrayIndexKey: console entries do not expose stable ids
                  key={index}
                  entry={entry}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function ConsoleEntryCard({ entry }: { readonly entry: ConsoleEntry }) {
  const path = entry.path.length > 0 ? entry.path.join("/") : null

  return (
    <article className="rounded-md border bg-muted/20 px-2.5 py-2">
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none",
            methodClassNames[entry.method]
          )}
        >
          {entry.method}
        </span>
        {path ? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {path}
          </span>
        ) : null}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background px-2 py-1.5 font-mono text-[11px] leading-snug">
        {formatConsoleArgs(entry.args)}
      </pre>
    </article>
  )
}

const defaultMethodClassName = "bg-foreground/10 text-foreground"

const methodClassNames = {
  trace: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  debug: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  log: defaultMethodClassName,
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/15 text-destructive",
  dir: defaultMethodClassName,
  table: defaultMethodClassName,
  time: defaultMethodClassName,
  timeLog: defaultMethodClassName,
  timeEnd: defaultMethodClassName,
  count: defaultMethodClassName,
  countReset: defaultMethodClassName,
} satisfies Record<ConsoleEntry["method"], string>

function formatConsoleArgs(args: ReadonlyArray<unknown>): string {
  return args.map(formatConsoleArg).join(" ")
}

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg
  if (typeof arg === "undefined") return "undefined"
  if (typeof arg === "bigint") return `${arg.toString()}n`
  if (typeof arg === "symbol") return arg.toString()
  if (typeof arg === "function") return `[Function ${arg.name || "anonymous"}]`
  if (arg instanceof Error) return arg.stack ?? arg.message

  try {
    const json = JSON.stringify(arg, null, 2)
    return json ?? String(arg)
  } catch {
    return String(arg)
  }
}
