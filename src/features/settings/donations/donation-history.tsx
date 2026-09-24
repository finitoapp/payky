import { useInfiniteQuery } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  HeartHandshakeIcon,
  RotateCwIcon,
  ZapIcon,
} from "lucide-react"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { fetchDonationHistory } from "@/core/integrations/donations/donations-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatSatsAmount } from "@/lib/format-utils.ts"

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
    refetch,
  } = useInfiniteQuery({
    queryKey: ["donations", "history"],
    queryFn: async ({ pageParam }) => {
      await using run = appRun()
      return await run.orThrow(fetchDonationHistory({ cursor: pageParam }))
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // A failed page stops the auto-load; the retry button below resumes it,
  // instead of the sentinel re-firing the same failing request on every scroll.
  const sentinelRef = useIntersectionObserver<HTMLDivElement>(
    () => void fetchNextPage(),
    { enabled: hasNextPage && !isFetchingNextPage && !isFetchNextPageError }
  )

  if (isPending) {
    return (
      <ListSkeleton rows={3} title={t("settings.donations.history.title")} />
    )
  }

  const items = data?.pages.flatMap((page) => page.items) ?? []

  if (isError && items.length === 0) {
    return (
      <VerticalNav
        title={t("settings.donations.history.title")}
        items={[]}
        empty={
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <CircleAlertIcon className="h-10 w-10 text-destructive" />
            <p className="text-balance text-center text-sm text-muted-foreground">
              {t("settings.donations.history.error")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              <RotateCwIcon />
              {t("settings.donations.history.retry")}
            </Button>
          </div>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <VerticalNav
        title={t("settings.donations.history.title")}
        empty={
          <div className="flex flex-col items-center justify-center gap-8 py-10">
            <HeartHandshakeIcon className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-foreground text-lg">
              {t("settings.donations.history.empty.title")}
            </h2>
            <p className="text-balance text-center text-sm text-muted-foreground">
              {t("settings.donations.history.empty.description")}
            </p>
          </div>
        }
        items={items.map((item) => ({
          kind: "static" as const,
          disableAction: true,
          icon: (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ZapIcon className="size-4" />
            </div>
          ),
          label: (
            <div className="flex flex-col gap-1">
              <strong>
                {t("settings.donations.history.amount", {
                  amount: formatSatsAmount(item.amountSats, locale),
                })}
              </strong>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(new Date(item.occurredAt), locale)}
              </span>
            </div>
          ),
        }))}
      />

      {isFetchingNextPage ? <ListSkeleton rows={2} /> : null}

      {isFetchNextPageError ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-center text-destructive text-sm font-medium">
            {t("settings.donations.history.error")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchNextPage()}
          >
            <RotateCwIcon />
            {t("settings.donations.history.retry")}
          </Button>
        </div>
      ) : null}

      {hasNextPage ? (
        <div ref={sentinelRef} aria-hidden className="h-1" />
      ) : null}
    </div>
  )
}
