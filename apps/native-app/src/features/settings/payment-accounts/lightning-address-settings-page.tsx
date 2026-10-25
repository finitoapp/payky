import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  lightningAddressProbeErrorKeys,
  parseLightningAddressInput,
} from "@payky/app-shared/lightning-address-form"
import { probeLightningAddress } from "@payky/core/integrations/lnurl/lnurl-pay-client"
import { saveLightningAddressAccount } from "@payky/core/modules/account/account-actions"
import { lightningAddressAccountQuery } from "@payky/core/modules/account/account-queries"
import { useState } from "react"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * The merchant's own Lightning wallet, as web's
 * `LightningAddressSettingsPage`: saving probes the address and refuses one
 * without LUD-21 verify (lightning-address/0003).
 */
export function LightningAddressSettingsPage() {
  const runToast = useRunToast()
  const toast = useToast()
  const { t } = useTranslation()
  const [account] = useEvoluQuery(lightningAddressAccountQuery).data
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  const value = draft ?? account?.address ?? ""
  // Entering the first address enables the method, as on web.
  const enabled = account === undefined || account.isDeleted !== 1

  const submit = async () => {
    setError(null)
    const parsed = parseLightningAddressInput(value)
    if (!parsed.ok) {
      setError(parsed.errorKey)
      return
    }
    setPending(true)
    const outcome = { refused: false }
    const saved = await runToast(async (run) => {
      const probe = await run(
        probeLightningAddress({ address: parsed.address })
      )
      if (!probe.ok) {
        outcome.refused = true
        setError(lightningAddressProbeErrorKeys[probe.error.type])
        return
      }
      await run.ok(
        saveLightningAddressAccount({ enabled, address: parsed.address })
      )
    })
    setPending(false)
    if (!saved || outcome.refused) return
    setDraft(null)
    toast.success(t("settings.lightningAddress.saved"))
  }

  return (
    <Screen>
      <FadeHeader
        title={t("settings.paymentAccounts.method.lightningAddress")}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.lightningAddress.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.lightningAddress.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>
                {t("settings.lightningAddress.address.label")}
              </FieldLabel>
              <Input
                value={value}
                disabled={pending}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t("settings.lightningAddress.address.placeholder")}
                invalid={error !== null}
                onChangeText={(text) => {
                  setDraft(text)
                  setError(null)
                }}
              />
              <FieldDescription>
                {t("settings.lightningAddress.address.description")}
              </FieldDescription>
              <FieldError>{error === null ? undefined : t(error)}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter justify="flex-end">
          <Button
            label={t("settings.lightningAddress.submit")}
            pending={pending}
            onPress={() => {
              void submit()
            }}
          />
        </CardFooter>
      </Card>
    </Screen>
  )
}
