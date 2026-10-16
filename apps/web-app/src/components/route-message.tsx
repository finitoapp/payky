import { useNavigate } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"

/**
 * A page's dead-end state: an id the URL can't parse, a row that isn't
 * there. The header's back arrow navigates home instead of running its
 * default `router.history.back()` — these states are also what a cold load
 * of a stale link lands on, and then there is no history entry behind them
 * to go back to. `replace` keeps the browser's back button from dropping the
 * user into the dead end again.
 */
export function RouteMessage({ children }: { readonly children: string }) {
  const navigate = useNavigate()

  return (
    <>
      <FadeHeader
        customStartAddonOnClick={() => {
          void navigate({ to: "/", replace: true })
        }}
      />
      <div className="flex min-h-full items-center justify-center px-8 text-center text-lg text-muted-foreground">
        {children}
      </div>
    </>
  )
}
