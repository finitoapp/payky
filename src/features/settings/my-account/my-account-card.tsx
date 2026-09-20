import { Link } from "@tanstack/react-router"
import { ChevronRight, CopyIcon } from "lucide-react"
import { Suspense } from "react"

import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { shortenNpub } from "@/core/linky/linky-identity.ts"
import { ProfileAvatar } from "@/features/settings/my-account/profile-avatar.tsx"
import { useLinkyIdentity, useMyNostrProfile } from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"

/**
 * The account as Linky shows it for the same recovery phrase: the active
 * Nostr key and the profile published for it. Avatar, name and the chevron
 * open the profile editor; the chevron sits where the settings rows below
 * keep theirs, the copy button right after the npub it copies.
 */
export function MyAccountCard() {
  return (
    <Card data-testid="my-account-card">
      <CardContent className="px-[18px] py-3">
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
      <Skeleton className="size-14 shrink-0 rounded-full" />
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
  const name = profile.data?.name ?? null

  const copyNpub = () =>
    copyToClipboard(identity.npub, {
      copied: t("settings.myAccount.npubCopied"),
      failed: t("settings.myAccount.npubCopyFailed"),
    })

  return (
    <div className="flex items-center gap-4">
      <Link
        to="/settings/profile"
        className="shrink-0"
        aria-label={t("settings.myAccount.edit")}
      >
        <ProfileAvatar
          pictureUrl={profile.data?.pictureUrl ?? null}
          className="size-14"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          to="/settings/profile"
          className={
            name === null
              ? "truncate text-base font-semibold text-muted-foreground"
              : "truncate text-base font-semibold"
          }
        >
          {profile.isPending ? " " : (name ?? t("settings.myAccount.setName"))}
        </Link>
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
            className="size-6 text-muted-foreground"
            aria-label={t("settings.myAccount.copyNpub")}
            onClick={() => void copyNpub()}
          >
            <CopyIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <Link
        to="/settings/profile"
        className="shrink-0 text-muted-foreground"
        aria-label={t("settings.myAccount.edit")}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
