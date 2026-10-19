import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type EetCertificateError,
  readEetCertificateFile,
} from "@payky/core/integrations/eet/eet-certificate"
import { storeEetCertificate } from "@payky/core/modules/eet/eet-actions"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { Field } from "../../../components/field.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import {
  type PickedCertificate,
  pickCertificateFile,
} from "../../../platform/pick-certificate-file.ts"

const certificateErrorKeys = {
  EetCertificateUnreadableError: "settings.eet.certificate.error.unreadable",
  EetCertificateWrongPasswordError:
    "settings.eet.certificate.error.wrongPassword",
  EetCertificateWithoutKeyError: "settings.eet.certificate.error.withoutKey",
  EetCertificateWithoutEicError: "settings.eet.certificate.error.withoutEic",
  EetCertificateExpiredError: "settings.eet.certificate.error.expired",
  EetCertificateNotYetValidError: "settings.eet.certificate.error.notYetValid",
} satisfies Record<EetCertificateError["type"], TranslationKey>

/**
 * Imports the cash-register certificate (a PKCS#12 file and its password).
 * The password lives only in this component's state, hidden while typed, and
 * is cleared after a successful import; it is never logged or put in a query.
 */
export function EetCertificateImport() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const toast = useToast()
  const [picked, setPicked] = useState<PickedCertificate | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const choose = async () => {
    const next = await pickCertificateFile()
    if (next === null) return
    setPicked(next)
    setError(null)
  }

  const importCertificate = async () => {
    if (picked === null) {
      setError("settings.eet.certificate.error.fileRequired")
      return
    }
    setPending(true)
    try {
      const bytes = await picked.read()
      if (bytes === null) {
        setError("settings.eet.certificate.error.unreadable")
        return
      }
      const certificate = await readEetCertificateFile({
        file: bytes,
        password,
        now: new Date(),
      })
      if (!certificate.ok) {
        setError(certificateErrorKeys[certificate.error.type])
        return
      }
      const saved = await runToast(async (run) => {
        await run.ok(
          storeEetCertificate({
            certificate: certificate.value,
            isTestCertificate: false,
          })
        )
      })
      if (!saved) return
      setPicked(null)
      setPassword("")
      toast.success(t("settings.eet.certificate.imported"))
    } catch {
      // The picker's cache copy may be gone or unreadable.
      setError("settings.eet.certificate.error.unreadable")
    } finally {
      setPending(false)
    }
  }

  return (
    <YStack gap="3">
      <YStack gap="1">
        <Text fontSize="sm" fontWeight="600">
          {t("settings.eet.certificate.file.label")}
        </Text>
        <Button
          size="lg"
          label={
            picked === null
              ? t("settings.eet.certificate.file.label")
              : picked.name
          }
          variant="outline"
          disabled={pending}
          onPress={() => {
            void choose()
          }}
        />
        <Text fontSize={12} color="muted-foreground">
          {t("settings.eet.certificate.file.description")}
        </Text>
      </YStack>
      <Field
        label={t("settings.eet.certificate.password.label")}
        value={password}
        disabled={pending}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        keyboardType="visible-password"
        contextMenuHidden
        error={error === null ? undefined : t(error)}
        onChangeText={(next) => {
          setPassword(next)
          setError(null)
        }}
      />
      <Button
        size="lg"
        label={t("settings.eet.certificate.import")}
        pending={pending}
        onPress={() => {
          void importCertificate()
        }}
      />
    </YStack>
  )
}
