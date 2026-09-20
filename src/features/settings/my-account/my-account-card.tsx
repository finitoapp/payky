import { CopyIcon, UserRoundIcon } from "lucide-react"
import { Suspense } from "react"

import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { shortenNpub } from "@/core/linky/linky-identity.ts"
import { useLinkyIdentity, useMyNostrProfile } from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"

/**
 * Read-only: the identity Linky shows for the same recovery phrase — its
 * active Nostr key (derived, or the one pasted into Linky and synced) and
 * the profile published for it — so a user can see at a glance that the
 * two apps agree. Editing stays in Linky.
 */
export function MyAccountCard() {
  return (
    <Card data-testid="my-account-card">
      <CardContent className="py-4">
        <Suspense fallback={<MyAccountSkeleton />}>
          <MyAccountIdentity />
        </Suspense>
      </CardContent>
    </Card>
  )
}

function MyAccountSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="size-16 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
    </div>
  )
}

function MyAccountIdentity() {
  const { t } = useTranslation()
  const identity = useLinkyIdentity()
  const profile = useMyNostrProfile(identity)

  const copyNpub = () =>
    copyToClipboard(identity.npub, {
      copied: t("settings.myAccount.npubCopied"),
      failed: t("settings.myAccount.npubCopyFailed"),
    })

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
        {profile.data?.pictureUrl ? (
          <img
            src={profile.data.pictureUrl}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRoundIcon className="size-7" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold">
            {profile.data?.name ?? t("settings.myAccount.loadingName")}
          </span>
          <Badge variant="secondary">
            {t(
              identity.source === "custom"
                ? "settings.myAccount.source.custom"
                : "settings.myAccount.source.derived"
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={identity.npub}
          >
            {shortenNpub(identity.npub)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings.myAccount.copyNpub")}
            onClick={() => void copyNpub()}
          >
            <CopyIcon />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {profile.data?.source === "generated"
            ? t("settings.myAccount.generatedProfile")
            : t("settings.myAccount.description")}
        </span>
      </div>
    </div>
  )
}
