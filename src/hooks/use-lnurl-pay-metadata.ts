import { useQuery } from "@tanstack/react-query"

import { fetchLnurlPayMetadata } from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

/**
 * The LNURL-pay metadata behind a Lightning address, `null` waiting for one.
 * One query key for the withdrawal form and the donations page, so an
 * address both look up is fetched once.
 */
export const useLnurlPayMetadata = (address: string | null) => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: ["lnurl-pay-metadata", address],
    queryFn: async () => {
      await using run = appRun()
      const result = await run(
        fetchLnurlPayMetadata({ address: address ?? "" })
      )
      if (!result.ok) {
        run.deps.console.warn("Failed to load LNURL-pay metadata", result.error)
        throw result.error
      }
      return result.value
    },
    enabled: address !== null,
    retry: false,
  })
}
