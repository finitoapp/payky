import { Pressable } from "react-native"
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard.ts"
import { useTranslation } from "../hooks/use-translation.ts"
import { QrCode } from "./qr-code.tsx"

/** A payment request QR that copies its content when tapped, as web's. */
export function CopyableQrCode({ value }: { readonly value: string }) {
  const { t } = useTranslation()
  const copy = useCopyToClipboard()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("paymentWait.copyQr")}
      onPress={() =>
        void copy(value, {
          copied: t("paymentWait.qrCopied"),
          failed: t("paymentWait.qrCopyFailed"),
        })
      }
    >
      <QrCode value={value} />
    </Pressable>
  )
}
