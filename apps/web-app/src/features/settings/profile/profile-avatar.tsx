import { cn } from "@/lib/utils.ts"

/** Shown while no picture is published: the account is a Payky account. */
const PAYKY_ICON_URL = "/pwa-icon-192.png"

export function ProfileAvatar({
  picture,
  className,
}: {
  readonly picture: string | null
  readonly className?: string
}) {
  return (
    <img
      src={picture ?? PAYKY_ICON_URL}
      alt=""
      referrerPolicy="no-referrer"
      className={cn(
        "size-14 shrink-0 rounded-full bg-muted object-cover",
        className
      )}
    />
  )
}
