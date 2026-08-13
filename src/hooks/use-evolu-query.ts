import type { Query, QueryRows, Row } from "@evolu/common"
import { use, useMemo, useSyncExternalStore } from "react"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
import { useEvolu } from "@/hooks/use-evolu"

export const useEvoluQuery = <R extends Row>(
  query: Query<EvoluSchema, R>
): { data: QueryRows<R> } => {
  const evolu = useEvolu()

  use(evolu.loadQuery(query))

  const data = useSyncExternalStore(
    useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
    useMemo(() => () => evolu.getQueryRows(query), [evolu, query])
  )

  return {
    data: data as QueryRows<R>,
  }
}
