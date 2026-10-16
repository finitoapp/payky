import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { OwnerId } from "@evolu/common"
import type { LanguageModel } from "ai"

export interface AiModelDep {
  readonly aiModel: LanguageModel
}

/**
 * The model behind Payky's AI proxy (ai/0001), or any OpenAI-compatible
 * endpoint such as a local Ollama. The account's owner id is the bearer token;
 * the proxy picks the model itself, so `model` matters only elsewhere.
 */
export const createAiModelDep = ({
  baseURL,
  ownerId,
  model = "payky",
}: {
  readonly baseURL: string
  readonly ownerId: OwnerId
  readonly model?: string
}): AiModelDep => ({
  aiModel: createOpenAICompatible({ name: "payky", baseURL, apiKey: ownerId })(
    model
  ),
})
