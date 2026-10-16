import { addKnownCashuMint } from "@payky/core/cashu/cashu-mints"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useRequirePermission } from "@/hooks/use-access.ts"
import { useCashuRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

const addErrorKeys = {
  CashuMintUrlInvalid: "settings.cashuMints.addError.invalid",
  MintUnreachable: "settings.cashuMints.addError.unreachable",
  MintRejected: "settings.cashuMints.addError.rejected",
} satisfies Record<string, TranslationKey>

/**
 * Adds a mint by URL. Unlike Linky, a mint that does not load or lists
 * another mint's keyset is refused, and the default stays (cashu.md §7).
 */
export function CashuMintNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const runToast = useCashuRunToast()
  const { require } = useRequirePermission()
  const [url, setUrl] = useState("")
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    setPending(true)
    setErrorKey(null)
    await runToast(async (run) => {
      const added = await run(addKnownCashuMint(url))
      if (!added.ok) {
        setErrorKey(addErrorKeys[added.error.type])
        return
      }
      await navigate({
        to: "/settings/payment-accounts/cashu/mints/$mint",
        params: { mint: added.value },
      })
    })
    setPending(false)
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.cashuMints.add")} />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field>
          <FieldLabel htmlFor="cashu-mint-url">
            {t("settings.cashuMints.url")}
          </FieldLabel>
          <Input
            id="cashu-mint-url"
            value={url}
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
          <FieldDescription>
            {t("settings.cashuMints.addDescription")}
          </FieldDescription>
          {errorKey === null ? null : <FieldError>{t(errorKey)}</FieldError>}
        </Field>
        <Button type="submit" disabled={pending || url.trim() === ""}>
          {t("settings.cashuMints.add")}
        </Button>
      </form>
    </>
  )
}
