import { z } from "zod"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"

const BILL_INSERT_MODE_STORAGE_KEY = "payky.billScanMode"

/**
 * Whether `/bill` adds items via the scanner instead of the item list: view
 * state, not application data, so it belongs in `localStorage` rather than
 * the device Evolu database — see `useLocalStorageState`.
 */
export function useBillInsertMode() {
  return useLocalStorageState(BILL_INSERT_MODE_STORAGE_KEY, false, z.boolean())
}
