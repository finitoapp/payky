import type { FetchDep } from "@payky/core/deps"
export const createFetchDep = (): FetchDep => ({ fetch: globalThis.fetch })
