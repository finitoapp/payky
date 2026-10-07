import { useEventListener } from "@dedalik/use-react"
import { useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { StoreIcon, TriangleAlert } from "lucide-react"
import { Suspense, useEffect, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { Alert, AlertDescription } from "@/components/reui/alert.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  accountListQuery,
  createOrSelectStationAccount,
  removeDeviceAccount,
} from "@/core/evolu/device-account.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import type { NostrPubkeyHex } from "@/core/modules/shared/schema.ts"
import { decodeStationLinkFragment } from "@/core/modules/station/station-link-utils.ts"
import { markAppEntered } from "@/features/shared/landing-redirect.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const wipeFragment = () => {
  if (window.location.hash === "") return
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`
  )
}

/**
 * Opens the PoS station a link carries (station/0001). The fragment holds
 * the station's secret, so it is read and wiped from the address bar, and so
 * is every later one opened in the same tab, which loads no new page.
 */
export function PosLoginPage() {
  const [link, setLink] = useState(() =>
    decodeStationLinkFragment(window.location.hash)
  )

  useEffect(wipeFragment, [])
  useEventListener("hashchange", () => {
    if (window.location.hash === "") return
    setLink(decodeStationLinkFragment(window.location.hash))
    wipeFragment()
  })

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="justify-center px-5 py-6">
        <Suspense fallback={null}>
          {link.ok ? <PosLoginConfirm link={link.value} /> : <InvalidLink />}
        </Suspense>
      </PhoneViewport>
    </main>
  )
}

function InvalidLink() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <Card>
      <CardHeader>
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
        <CardTitle>{t("posLogin.invalid.title")}</CardTitle>
        <CardDescription>{t("posLogin.invalid.description")}</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button
          type="button"
          onClick={() => {
            void navigate({ to: "/", replace: true })
          }}
        >
          {t("posLogin.invalid.home")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function PosLoginConfirm({
  link,
}: {
  readonly link: {
    readonly masterKey: MasterKey
    readonly ownerPubkey: NostrPubkeyHex
  }
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const account = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const [settings] = useEvoluQuery(settingsQuery).data
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const [pending, setPending] = useState(false)
  const alreadyThisStation = link.masterKey === account.masterKey
  // The account active now is a leftover when it was never set up, usually
  // the random one a first start creates.
  const activeAccountSetUp = settings !== undefined
  // Leaving PoS mode falls back to these, and anyone at the station can.
  const holdsOtherAccounts = accounts.some(
    ({ id, kind }) =>
      kind !== "station" && (id !== account.id || activeAccountSetUp)
  )

  useEffect(() => {
    if (alreadyThisStation) void navigate({ to: "/", replace: true })
  }, [alreadyThisStation, navigate])

  if (alreadyThisStation) return null

  const openStation = async () => {
    setPending(true)
    try {
      const { accountId } = await createOrSelectStationAccount(
        deviceEvolu,
        link
      )
      if (!activeAccountSetUp && account.id !== accountId) {
        removeDeviceAccount(deviceEvolu, account.id)
      }
      markAppEntered()
      reloadAppEvolu()
      await navigate({ to: "/", replace: true })
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <StoreIcon className="size-8 text-muted-foreground" aria-hidden />
        <CardTitle>{t("posLogin.title")}</CardTitle>
        <CardDescription>{t("posLogin.description")}</CardDescription>
      </CardHeader>
      {holdsOtherAccounts ? (
        <CardContent>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>{t("posLogin.otherAccounts")}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            void navigate({ to: "/", replace: true })
          }}
        >
          {t("posLogin.cancel")}
        </Button>
        <Button type="button" disabled={pending} onClick={openStation}>
          <StoreIcon data-icon="inline-start" />
          {t("posLogin.confirm")}
        </Button>
      </CardFooter>
    </Card>
  )
}
