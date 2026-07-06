import {
  CircleAlertIcon,
  HeartHandshakeIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import {
  type DonationHistoryItem,
  fetchDonationHistory,
} from "@/core/integrations/donations/donations-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime } from "@/lib/format-utils.ts"

export const DonationHistory = () => {
  const appRun = useAppRun()
  const console = useConsole()
  const locale = useLocale()
  const { t } = useTranslation()
  const [items, setItems] = useState<readonly DonationHistoryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let active = true

    const loadFirstPage = async () => {
      setIsLoading(true)
      setHasError(false)

      await using run = appRun()
      const result = await run(fetchDonationHistory({}))

      if (!active) return

      if (!result.ok) {
        console.error("Failed to load donation history", result.error)
        setHasError(true)
        setIsLoading(false)
        return
      }

      setItems(result.value.items)
      setNextCursor(result.value.nextCursor)
      setIsLoading(false)
    }

    void loadFirstPage()

    return () => {
      active = false
    }
  }, [appRun, console])

  const loadMore = async () => {
    if (nextCursor === null) return

    setIsLoadingMore(true)
    setHasError(false)

    try {
      await using run = appRun()
      const result = await run(fetchDonationHistory({ cursor: nextCursor }))

      if (!result.ok) {
        console.error("Failed to load more donation history", result.error)
        setHasError(true)
        return
      }

      setItems((previous) => [...previous, ...result.value.items])
      setNextCursor(result.value.nextCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const navItems = items.length === 0 ? ([false] as const) : items
  const showInitialError = hasError && items.length === 0 && !isLoading
  const showLoadMoreError = hasError && items.length > 0

  return (
    <div className="flex flex-col gap-3">
      <VerticalNav
        title={t("settings.donations.history.title")}
        items={navItems.map((item) => {
          if (item === false) {
            return {
              disableAction: true,
              label: isLoading ? (
                <div className="flex justify-center py-10">
                  <LoaderCircleIcon className="animate-spin text-muted-foreground" />
                </div>
              ) : showInitialError ? (
                <div className="flex flex-col items-center justify-center gap-8 py-10">
                  <CircleAlertIcon className="h-10 w-10 text-destructive" />
                  <p className="text-balance text-center text-sm text-muted-foreground">
                    {t("settings.donations.history.error")}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-8 py-10">
                  <HeartHandshakeIcon className="h-10 w-10 text-muted-foreground" />
                  <h2 className="text-foreground text-lg">
                    {t("settings.donations.history.empty.title")}
                  </h2>
                  <p className="text-balance text-center text-sm text-muted-foreground">
                    {t("settings.donations.history.empty.description")}
                  </p>
                </div>
              ),
            }
          }

          return {
            label: (
              <div className="flex justify-between gap-2">
                <div className="flex w-max flex-col items-start gap-2">
                  <strong>{t("settings.donations.history.item")}</strong>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(new Date(item.occurredAt), locale)}
                  </span>
                </div>
              </div>
            ),
            action: (
              <span className="font-medium text-sm">
                {t("settings.donations.history.amount", {
                  amount: item.amountSats.toLocaleString(locale),
                })}
              </span>
            ),
          }
        })}
      />

      {showLoadMoreError ? (
        <p className="text-center text-destructive text-sm font-medium">
          {t("settings.donations.history.error")}
        </p>
      ) : null}

      {nextCursor !== null ? (
        <Button
          type="button"
          variant="outline"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore ? <LoaderCircleIcon className="animate-spin" /> : null}
          {isLoadingMore
            ? t("settings.donations.history.loadMore.pending")
            : t("settings.donations.history.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
