export interface FetchDep {
  readonly fetch: typeof globalThis.fetch
}

export const createFetchDep = () => ({ fetch: globalThis.fetch })
