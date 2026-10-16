import { sqliteTrue } from "@evolu/common"

import { appEnv } from "@/core/app-env.ts"

const isEetProductionConfigured =
  appEnv.VITE_PAYKY_EET_PRODUCTION_URL !== undefined

import { eetSettingsQuery } from "@payky/core/modules/eet/eet-queries"
import {
  isEetSandboxActive,
  resolveEetEnvironment,
} from "@payky/core/modules/eet/eet-utils"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

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
