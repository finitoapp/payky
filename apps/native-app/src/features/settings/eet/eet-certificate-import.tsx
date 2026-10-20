import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type EetCertificateError,
  readEetCertificateFile,
} from "@payky/core/integrations/eet/eet-certificate"
import { storeEetCertificate } from "@payky/core/modules/eet/eet-actions"
import Upload from "lucide-react-native/icons/upload"
import { useState } from "react"
import { XStack } from "tamagui"
import { Button } from "../../../components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { eetNativeCrypto } from "../../../platform/eet-crypto"
import {
  type PickedCertificate,
  pickCertificateFile,
} from "../../../platform/pick-certificate-file"

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
        native: eetNativeCrypto,
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
    <FieldGroup>
      <Field>
        <FieldLabel>{t("settings.eet.certificate.file.label")}</FieldLabel>
        <Button
          label={
            picked === null
              ? t("settings.eet.certificate.file.label")
              : picked.name
          }
          variant="outline"
          iconStart={Upload}
          disabled={pending}
          onPress={() => {
            void choose()
          }}
        />
        <FieldDescription>
          {t("settings.eet.certificate.file.description")}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>{t("settings.eet.certificate.password.label")}</FieldLabel>
        <Input
          value={password}
          invalid={error !== null}
          disabled={pending}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          keyboardType="visible-password"
          contextMenuHidden
          onChangeText={(next) => {
            setPassword(next)
            setError(null)
          }}
        />
        <FieldError>{error === null ? undefined : t(error)}</FieldError>
      </Field>
      <XStack justify="flex-end">
        <Button
          label={t("settings.eet.certificate.import")}
          iconStart={Upload}
          pending={pending}
          onPress={() => {
            void importCertificate()
          }}
        />
      </XStack>
    </FieldGroup>
  )
}
