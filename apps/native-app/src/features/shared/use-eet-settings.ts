import { sqliteTrue } from "@evolu/common"
import { eetSettingsQuery } from "@payky/core/modules/eet/eet-queries"
import {
  isEetSandboxActive,
  resolveEetEnvironment,
} from "@payky/core/modules/eet/eet-utils"
import { nativeEnv } from "../../core/native-env.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

const isEetProductionConfigured =
  nativeEnv.EXPO_PUBLIC_PAYKY_EET_PRODUCTION_URL !== undefined

/** Native twin of web's `useEetSettings`: the stored row and what it implies. */
export function useEetSettings() {
  const [settings] = useEvoluQuery(eetSettingsQuery).data
  const enabledAt = settings?.enabledAt ?? null
  const isTestCertificate = settings?.isTestCertificate === sqliteTrue
  const environment = resolveEetEnvironment({
    environment: settings?.environment ?? null,
    isTestCertificate,
    isProductionAvailable: isEetProductionConfigured,
  })

  return {
    settings,
    environment,
    isEnabled: enabledAt !== null,
    isTestCertificate,
    isProductionAvailable: isEetProductionConfigured,
    tipOwner: settings?.tipOwner ?? "business",
    isSandboxActive: isEetSandboxActive({ enabledAt, environment }),
  }
}
