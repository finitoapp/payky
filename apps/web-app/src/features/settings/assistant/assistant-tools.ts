import type { Run } from "@evolu/common"
import { createDataTools } from "@payky/core/ai/assistant"
import { createRepoAiTools } from "@payky/core/ai/repo-ai-tools"
import type { FetchDep } from "@payky/core/deps"
import type { AiAssistantAccess } from "@payky/core/evolu/device-client"
import type { EvoluDep } from "@payky/core/modules/shared/evolu-deps"
import { createSnapshotRepoFilesLoader } from "@/features/settings/assistant/snapshot-repo-files.ts"

/**
 * The tools the assistant may call on this device (ai/0004): Payky's
 * documentation and code always, the merchant's data only when they allowed
 * it. `repoTools` tells the documentation tools apart from the data ones.
 */
export const createAssistantTools = (
  access: Exclude<AiAssistantAccess, "off">,
  run: Run<EvoluDep & FetchDep>
) => {
  const repoTools = createRepoAiTools(createSnapshotRepoFilesLoader(run))
  return {
    repoTools,
    tools:
      access === "all" ? { ...createDataTools(run), ...repoTools } : repoTools,
  }
}
