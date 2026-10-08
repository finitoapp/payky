import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

import { verticalNavShellClassName } from "@/components/vertical-nav.tsx"
import { shortenNpub } from "@/core/integrations/nostr/nostr-client.ts"
import { ProfileAvatar } from "@/features/settings/profile/profile-avatar.tsx"
import {
  useActiveNostrProfile,
  useNostrIdentity,
} from "@/hooks/use-nostr-profile.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"

/**
 * The account's Nostr profile at the top of the settings list — the same
 * one Linky shows for this recovery phrase. Opens the profile editor.
 */
export function ProfileCard() {
  const { t } = useTranslation()
  const identity = useNostrIdentity()
  const profile = useActiveNostrProfile()
  const name = profile.data?.name ?? null

  return (
    <Link
      to="/settings/profile"
      data-testid="profile-card"
      className={cn(
        verticalNavShellClassName,
        "flex-row items-center gap-4 px-4 py-3 transition-all hover:bg-accent/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      )}
    >
      <ProfileAvatar picture={profile.data?.picture ?? null} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-base font-semibold",
            name === null && "text-muted-foreground"
          )}
        >
          {profile.isPending ? " " : (name ?? t("settings.profile.setName"))}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {shortenNpub(identity.npub)}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
