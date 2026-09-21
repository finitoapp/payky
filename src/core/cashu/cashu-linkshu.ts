export type LinkshuModule = typeof import("@linky/linkshu")
export type EffectModule = typeof import("effect")

export interface LinkshuModules {
  readonly linkshu: LinkshuModule
  readonly effect: EffectModule
}

let modulesPromise: Promise<LinkshuModules> | undefined

/**
 * Loads `@linky/linkshu` and `effect` on first use so neither is in the app's
 * main bundle — the same split `spark-wallet.ts` makes for the Spark SDK. A
 * terminal without a cashu account never pays for either.
 */
export const loadLinkshuModules = (): Promise<LinkshuModules> => {
  modulesPromise ??= Promise.all([
    import("@linky/linkshu"),
    import("effect"),
  ]).then(([linkshu, effect]) => ({ linkshu, effect }))

  return modulesPromise
}
