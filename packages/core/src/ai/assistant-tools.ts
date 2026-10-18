import type { Run } from "@evolu/common"
import type { FetchDep } from "../deps.ts"
import type { AiAssistantAccess } from "../evolu/device-client.ts"
import type { EvoluDep } from "../modules/shared/evolu-deps.ts"
import { createDataTools } from "./assistant.ts"
import { createRepoAiTools } from "./repo-ai-tools.ts"
import { createSnapshotRepoFilesLoader } from "./snapshot-repo-files.ts"

/**
 * The tools the assistant may call on this device (ai/0004): Payky's
 * documentation and code always, the merchant's data only when they allowed
 * it. `repoTools` tells the documentation tools apart from the data ones.
 */
export const createAssistantTools = (
  access: Exclude<AiAssistantAccess, "off">,
  run: Run<EvoluDep & FetchDep>,
  snapshot: { readonly snapshotUrl: string; readonly appVersion: string }
) => {
  const repoTools = createRepoAiTools(
    createSnapshotRepoFilesLoader(run, snapshot)
  )
  return {
    repoTools,
    tools:
      access === "all" ? { ...createDataTools(run), ...repoTools } : repoTools,
  }
}
