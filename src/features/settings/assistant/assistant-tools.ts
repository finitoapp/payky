import type { Run } from "@evolu/common"
import { createDataTools } from "@/core/ai/assistant.ts"
import { createRepoAiTools } from "@/core/ai/repo-ai-tools.ts"
import type { FetchDep } from "@/core/deps.ts"
import type { AiAssistantAccess } from "@/core/evolu/device-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
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
