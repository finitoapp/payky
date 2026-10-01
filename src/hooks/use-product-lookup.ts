import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import {
  isRetailBarcode,
  lookupOpenFactsProduct,
} from "@/core/integrations/open-facts/open-facts-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import {
  useDeviceSettings,
  useUpdateDeviceSettings,
} from "@/hooks/use-device-settings.ts"

export function useProductLookupEnabled(): boolean {
  return useDeviceSettings().productLookupEnabled === sqliteTrue
}

export function useSetProductLookupEnabled() {
  const updateDeviceSettings = useUpdateDeviceSettings()

  return React.useCallback(
    (enabled: boolean) => {
      updateDeviceSettings({
        productLookupEnabled: enabled ? sqliteTrue : sqliteFalse,
      })
    },
    [updateDeviceSettings]
  )
}

/**
 * Looks a scanned code up in the Open Facts databases, but only when this
 * device opted in and the code is a retail barcode. A failed lookup is not
 * worth telling the user about — the form simply stays empty — so errors
 * surface only as `product` staying `undefined`.
 */
export function useProductLookup(code: string | null) {
  const appRun = useAppRun()
  const { language } = useDeviceSettings()
  const enabled = useProductLookupEnabled()

  const query = useQuery({
    queryKey: ["productLookup", code, language],
    enabled: enabled && code !== null && isRetailBarcode(code),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (code === null) return null
      await using run = appRun()
      const result = await run(lookupOpenFactsProduct({ code, language }))
      if (!result.ok) throw new Error(result.error.type)
      return result.value
    },
  })

  return {
    product: query.data ?? undefined,
    isFetching: query.isFetching,
  }
}
