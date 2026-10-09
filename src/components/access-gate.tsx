import { useLocation, useMatches, useNavigate } from "@tanstack/react-router"
import { useAtom, useSetAtom, useStore } from "jotai"
import { type ReactNode, useEffect } from "react"

import { accessLastActivityAtom, accessSessionAtom } from "@/atoms/access.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { PinScreen } from "@/components/pin-screen.tsx"
import {
  type Permission,
  sessionIdleTimeoutMs,
} from "@/core/modules/access/access-types.ts"
import { useAccess } from "@/hooks/use-access.ts"

/**
 * The permissions every matched route needs, layouts included (access/0003):
 * a permission on any level locks the whole page.
 */
const useRequiredPermissions = (): ReadonlyArray<Permission> => {
  const joined = useMatches({
    select: (matches) =>
      [
        ...new Set(
          matches.flatMap((match) => {
            const access = match.staticData.access
            return access === undefined || access === "free" ? [] : [access]
          })
        ),
      ].join(","),
  })
  return joined === "" ? [] : (joined.split(",") as Array<Permission>)
}

/**
 * Renders the PIN screen instead of a `_terminal` page the device may not
 * open (access/0001), and runs the PIN session's end rules (access/0005).
 */
export function AccessGate({ children }: { readonly children: ReactNode }) {
  const access = useAccess()
  const required = useRequiredPermissions()
  const pathname = useLocation({ select: (location) => location.pathname })
  const [sessionState, setSession] = useAtom(accessSessionAtom)
  const missing = required.filter(
    (permission) => !access.effective.has(permission)
  )
  const coveredByDefaults =
    required.length > 0 &&
    required.every((permission) => access.defaults.has(permission))

  // Navigating to a route the device defaults already cover ends the
  // session; a `free` route neither starts nor ends one.
  useEffect(() => {
    if (access.session && coveredByDefaults) setSession(null)
  }, [access.session, coveredByDefaults, setSession])

  // Switching account ends the session: switching back must not revive it.
  useEffect(() => {
    if (sessionState !== null && sessionState.accountId !== access.accountId) {
      setSession(null)
    }
  }, [access.accountId, sessionState, setSession])

  const [first] = missing
  if (access.enabled && first !== undefined) {
    return (
      <>
        {pathname === "/" ? null : <FadeHeader />}
        <PinScreen
          key={pathname}
          permission={first}
          target={pathname}
          onUnlocked={() => {
            setSession({ accountId: access.accountId })
          }}
        />
      </>
    )
  }

  return (
    <>
      {access.session ? (
        <SessionWatcher sell={access.defaults.has("sell")} />
      ) : null}
      {children}
    </>
  )
}

/**
 * Ends the session after five minutes without activity, on any route, and
 * when the app goes to the background (access/0005). A device without `sell`
 * then returns to its PIN screen, which is home's (rule 12).
 */
function SessionWatcher({ sell }: { readonly sell: boolean }) {
  const store = useStore()
  const setSession = useSetAtom(accessSessionAtom)
  const navigate = useNavigate()

  useEffect(() => {
    const end = () => {
      setSession(null)
      if (!sell) void navigate({ to: "/", replace: true })
    }
    const touch = () => {
      store.set(accessLastActivityAtom, Date.now())
    }
    // Mounted when the session starts, whichever way it started.
    touch()
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") end()
    }
    const interval = window.setInterval(() => {
      if (
        Date.now() - store.get(accessLastActivityAtom) >
        sessionIdleTimeoutMs
      ) {
        end()
      }
    }, 5000)

    window.addEventListener("pointerdown", touch, { capture: true })
    window.addEventListener("keydown", touch, { capture: true })
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("pointerdown", touch, { capture: true })
      window.removeEventListener("keydown", touch, { capture: true })
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [navigate, sell, setSession, store])

  return null
}
