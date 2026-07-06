import { useInfiniteQuery } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  HeartHandshakeIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import { fetchDonationHistory } from "@/core/integrations/donations/donations-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime } from "@/lib/format-utils.ts"

export const DonationHistory = () => {
  const appRun = useAppRun()
  const locale = useLocale()
  const { t } = useTranslation()

  const {
    data,
    isPending,
    isError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["donations", "history"],
    queryFn: async ({ pageParam }) => {
      await using run = appRun()
      return run.orThrow(fetchDonationHistory({ cursor: pageParam }))
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const navItems = items.length === 0 ? ([false] as const) : items
  const showInitialError = isError && items.length === 0 && !isPending
  const showLoadMoreError = isFetchNextPageError && items.length > 0

  return (
    <div className="flex flex-col gap-3">
      <VerticalNav
        title={t("settings.donations.history.title")}
        items={navItems.map((item) => {
          if (item === false) {
            return {
              disableAction: true,
              label: isPending ? (
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

      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : null}
          {isFetchingNextPage
            ? t("settings.donations.history.loadMore.pending")
            : t("settings.donations.history.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
