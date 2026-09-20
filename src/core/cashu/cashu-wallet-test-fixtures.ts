import type {
  CashuTopupReceipt,
  CashuWallet,
} from "@/core/cashu/cashu-wallet.ts"

const notImplemented = (): never => {
  throw new Error("not implemented")
}

/**
 * A `CashuWallet` for tests: records what was asked of it and lets the test
 * announce a minted topup the way the real wallet does once a mint settles a
 * quote. Unset methods throw, so a test only pays for what it exercises.
 */
export class FakeCashuWallet implements CashuWallet {
  readonly watchCalls: number[] = []
  readonly disposals: unknown[] = []
  private readonly settledListeners = new Set<
    (receipt: CashuTopupReceipt) => void
  >()
  private readonly overrides: Partial<CashuWallet>

  constructor(overrides: Partial<CashuWallet> = {}) {
    this.overrides = overrides
  }

  startTopup: CashuWallet["startTopup"] = (params) =>
    (this.overrides.startTopup ?? notImplemented)(params)

  watchPendingTopups: CashuWallet["watchPendingTopups"] = async () => {
    this.watchCalls.push(Date.now())
    await this.overrides.watchPendingTopups?.()
  }

  subscribeTopupSettled: CashuWallet["subscribeTopupSettled"] = (listener) => {
    this.settledListeners.add(listener)
    return () => {
      this.settledListeners.delete(listener)
    }
  }

  getBalances: CashuWallet["getBalances"] = () =>
    (this.overrides.getBalances ?? notImplemented)()

  subscribeInventory: CashuWallet["subscribeInventory"] = (listener) =>
    (this.overrides.subscribeInventory ?? (() => () => undefined))(listener)

  restore: CashuWallet["restore"] = (params) =>
    (this.overrides.restore ?? notImplemented)(params)

  emitTopupSettled(receipt: CashuTopupReceipt): void {
    for (const listener of this.settledListeners) listener(receipt)
  }

  listenerCount(): number {
    return this.settledListeners.size
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposals.push(null)
    this.settledListeners.clear()
  }
}
