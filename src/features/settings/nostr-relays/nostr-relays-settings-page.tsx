import { useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { Suspense, useId, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import type { LinkyIdentity } from "@/core/linky/linky-identity.ts"
import { normalizeRelayUrl } from "@/core/linky/nostr-pool.ts"
import {
  type NostrRelayList,
  publishNostrRelayList,
} from "@/core/linky/nostr-relay-lists.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import {
  bootstrapNostrRelays,
  myNostrProfileQueryKey,
  nostrRelayListQueryKey,
  useLinkyIdentity,
  useNostrRelayList,
} from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * The relays the account's profile lives on, as the NIP-65 relay list
 * published under its key says. Adding or removing one republishes the list
 * (and the NIP-17 DM relay list with it), so every app signed in with this
 * recovery phrase picks the change up from the relays themselves.
 */
export function NostrRelaysSettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.nostrRelays.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.nostrRelays.title")}</CardTitle>
          <CardDescription>
            {t("settings.nostrRelays.card.description")}
          </CardDescription>
        </CardHeader>
        <Suspense fallback={<RelayListSkeleton />}>
          <RelayListEditor />
        </Suspense>
      </Card>
    </>
  )
}

function RelayListSkeleton() {
  return (
    <CardContent className="flex flex-col gap-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </CardContent>
  )
}

function RelayListEditor() {
  const identity = useLinkyIdentity()
  const relayList = useNostrRelayList(identity)

  if (relayList.isPending) return <RelayListSkeleton />

  return (
    <RelayListForm
      identity={identity}
      published={relayList.data ?? null}
      key={identity.pubkey}
    />
  )
}

function RelayListForm({
  identity,
  published,
}: {
  readonly identity: LinkyIdentity
  readonly published: NostrRelayList | null
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const queryClient = useQueryClient()
  const urlInputId = useId()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  const relayUrls = published?.relayUrls ?? bootstrapNostrRelays

  const publish = async (nextRelayUrls: ReadonlyArray<string>) => {
    setPending(true)
    try {
      const next = await publishNostrRelayList({
        nsec: identity.nsec,
        relays: bootstrapNostrRelays,
        relayUrls: nextRelayUrls,
      })
      queryClient.setQueryData(nostrRelayListQueryKey(identity.pubkey), next)
      await queryClient.invalidateQueries({
        queryKey: myNostrProfileQueryKey(identity.pubkey),
      })
      toast.success(t("settings.nostrRelays.published"))
      return true
    } catch {
      toast.error(t("settings.nostrRelays.publishFailed"))
      return false
    } finally {
      setPending(false)
    }
  }

  const addRelay = async () => {
    const normalized = normalizeRelayUrl(url)
    if (normalized === null) {
      setError("settings.nostrRelays.url.invalid")
      return
    }
    if (relayUrls.includes(normalized)) {
      setError("settings.nostrRelays.url.duplicate")
      return
    }
    setError(null)
    if (await publish([...relayUrls, normalized])) setUrl("")
  }

  const removeRelay = async (relayUrl: string) => {
    const confirmed = await confirm({
      title: t("settings.nostrRelays.remove.confirm.title"),
      description: t("settings.nostrRelays.remove.confirm.description", {
        url: relayUrl,
      }),
      confirmLabel: t("settings.nostrRelays.remove.confirm.action"),
      cancelLabel: t("settings.nostrRelays.remove.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return
    await publish(relayUrls.filter((candidate) => candidate !== relayUrl))
  }

  return (
    <>
      <CardContent className="flex flex-col gap-5">
        <ul className="flex flex-col gap-3">
          {relayUrls.map((relayUrl) => (
            <li
              key={relayUrl}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {relayUrl}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                disabled={pending || relayUrls.length <= 1}
                aria-label={t("settings.nostrRelays.remove", {
                  url: relayUrl,
                })}
                onClick={() => void removeRelay(relayUrl)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        {published === null ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.nostrRelays.defaults")}
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void addRelay()
          }}
        >
          <FieldGroup>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor={urlInputId}>
                {t("settings.nostrRelays.url.label")}
              </FieldLabel>
              <Input
                id={urlInputId}
                value={url}
                disabled={pending}
                aria-invalid={error !== null}
                autoComplete="off"
                inputMode="url"
                placeholder="wss://"
                onChange={(event) => {
                  setUrl(event.currentTarget.value)
                  setError(null)
                }}
              />
              <FieldDescription>
                {t("settings.nostrRelays.url.description")}
              </FieldDescription>
              <FieldError>{error ? t(error) : null}</FieldError>
            </Field>
          </FieldGroup>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={pending || url.trim() === ""}>
              <Plus data-icon="inline-start" />
              {t("settings.nostrRelays.add")}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {t("settings.nostrRelays.footer")}
        </p>
      </CardFooter>
    </>
  )
}
