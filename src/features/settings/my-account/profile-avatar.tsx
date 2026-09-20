import { cn } from "@/lib/utils.ts"

/** Shown while no picture is published: the account is a Payky account. */
const PAYKY_ICON_URL = "/pwa-icon-192.png"

export function ProfileAvatar({
  pictureUrl,
  className,
}: {
  readonly pictureUrl: string | null
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <img
        src={pictureUrl ?? PAYKY_ICON_URL}
        alt=""
        className="size-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
