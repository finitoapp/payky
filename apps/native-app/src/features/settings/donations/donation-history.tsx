import { formatDateTime } from "@payky/app-shared/format-date"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import { fetchDonationHistory } from "@payky/core/integrations/donations/donations-client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Text, XStack, YStack } from "tamagui"
import { Button } from "../../../components/ui/button.tsx"
import { apiUrl } from "../../../core/native-env.ts"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"

/** The donations received so far, newest first, a page at a time. */
export function DonationHistory() {
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
      return await run.orThrow(
        fetchDonationHistory({
          endpoint: apiUrl("/api/donations"),
          cursor: pageParam,
        })
      )
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
  const items = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <YStack gap="3">
      <Text fontWeight="700">{t("settings.donations.history.title")}</Text>
      {isPending ? (
        <Text color="muted-foreground">…</Text>
      ) : isError && items.length === 0 ? (
        <YStack gap="2">
          <Text color="destructive" accessibilityRole="alert">
            {t("settings.donations.history.error")}
          </Text>
          <Button
            size="sm"
            label={t("settings.donations.history.retry")}
            variant="outline"
            onPress={() => {
              void refetch()
            }}
          />
        </YStack>
      ) : items.length === 0 ? (
        <YStack gap="1">
          <Text fontWeight="600">
            {t("settings.donations.history.empty.title")}
          </Text>
          <Text color="muted-foreground">
            {t("settings.donations.history.empty.description")}
          </Text>
        </YStack>
      ) : (
        items.map((item) => (
          <XStack
            key={`${item.occurredAt}-${item.amountSats}`}
            items="center"
            gap="3"
            p="3"
            rounded="lg"
            borderWidth={1}
            borderColor="border-color"
          >
            <YStack flex={1}>
              <Text fontWeight="700">
                {t("settings.donations.history.amount", {
                  amount: formatSatsAmount(item.amountSats, locale),
                })}
              </Text>
              <Text fontSize={12} color="muted-foreground">
                {formatDateTime(new Date(item.occurredAt), locale)}
              </Text>
            </YStack>
          </XStack>
        ))
      )}
      {isFetchNextPageError ? (
        <Text color="destructive" accessibilityRole="alert">
          {t("settings.donations.history.error")}
        </Text>
      ) : null}
      {hasNextPage ? (
        <Button
          size="lg"
          label={t(
            isFetchNextPageError
              ? "settings.donations.history.retry"
              : "settings.donations.history.more"
          )}
          variant="outline"
          pending={isFetchingNextPage}
          onPress={() => {
            void fetchNextPage()
          }}
        />
      ) : null}
    </YStack>
  )
}
