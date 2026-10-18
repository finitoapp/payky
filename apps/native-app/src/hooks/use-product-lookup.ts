import { sqliteTrue } from "@evolu/common"
import {
  createDeviceQuery,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import {
  isRetailBarcode,
  lookupOpenFactsProduct,
} from "@payky/core/integrations/open-facts/open-facts-client"
import { useQuery } from "@tanstack/react-query"
import { useAppRun } from "./use-app-run.ts"
import { useDeviceEvoluQuery } from "./use-evolu-query.ts"
import { useTranslation } from "./use-translation.ts"

const lookupEnabledQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "productLookupEnabled"])
    .where("id", "=", deviceSettingsId)
)

/**
 * Looks a scanned code up in the Open Facts databases, but only when this
 * device opted in and the code is a retail barcode, as web's hook. A failed
 * lookup is not worth telling the user about: the form simply stays empty,
 * so errors surface only as `product` staying `undefined`.
 */
export function useProductLookup(code: string | null) {
  const appRun = useAppRun()
  const { language } = useTranslation()
  const enabled =
    useDeviceEvoluQuery(lookupEnabledQuery).data[0]?.productLookupEnabled ===
    sqliteTrue

  const query = useQuery({
    queryKey: ["productLookup", code, language],
    enabled: enabled && code !== null && isRetailBarcode(code),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (code === null) return null
      await using run = appRun()
      const result = await run(lookupOpenFactsProduct({ code, language }))
      if (!result.ok) throw result.error
      return result.value
    },
  })

  return {
    product: query.data ?? undefined,
    isFetching: query.isFetching,
  }
}
