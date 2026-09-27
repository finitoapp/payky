import { sqliteTrue } from "@evolu/common"

import { isEetProductionConfigured } from "@/core/integrations/eet/eet-client.ts"
import { eetSettingsQuery } from "@/core/modules/eet/eet-queries.ts"
import {
  isEetSandboxActive,
  resolveEetEnvironment,
} from "@/core/modules/eet/eet-utils.ts"
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
