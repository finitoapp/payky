import { cashuSeedMintErrorKeys } from "@payky/app-shared/cashu-mint-errors"
import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import { seedCashuMintOnConfirm } from "@payky/core/modules/cashu/cashu-mint-actions"
import { MAIN_MINT_URL } from "@payky/core/modules/cashu/cashu-utils"
import { Text, YStack } from "tamagui"
import { Button } from "../../../components/ui/button.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useAppOwnerSync } from "../../../hooks/use-app-owner-sync.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * In place of the trusted mints on a device that knows none (cashu/0018),
 * as web's `CashuMintsNotSynced`: while the sync is on its way it only says
 * so; once it is blocked by relays this device cannot reach, it names them
 * and lets the merchant take payments at the default mint until the list
 * arrives (cashu/0013).
 */
export function CashuMintsNotSynced() {
  const { t } = useTranslation()
  const sync = useAppOwnerSync()
  const { require } = useRequirePermission()
  const confirm = useConfirm()
  const runToast = useRunToast()

  const takeDefaultMint = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    const confirmed = await confirm({
      title: t("settings.cashuMints.blocked.confirm.title"),
      description: t("settings.cashuMints.blocked.confirm.description", {
        mint: formatMintLabel(MAIN_MINT_URL),
      }),
      confirmLabel: t("settings.cashuMints.blocked.confirm.confirm"),
      cancelLabel: t("settings.cashuMints.blocked.confirm.cancel"),
    })
    if (!confirmed) return
    await runToast(async (run) => {
      const seeded = await run(seedCashuMintOnConfirm)
      if (!seeded.ok) return cashuSeedMintErrorKeys[seeded.error.type]
    })
  }

  return (
    <YStack gap="3">
      <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
        {t("settings.cashuMints.notSynced")}
      </Text>
      {sync.type === "blocked" ? (
        <>
          <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
            {t("settings.cashuMints.blocked.description", {
              relays: sync.unreachable.join(", "),
            })}
          </Text>
          <Button
            variant="outline"
            label={t("settings.cashuMints.blocked.useDefault")}
            onPress={takeDefaultMint}
          />
        </>
      ) : null}
    </YStack>
  )
}
