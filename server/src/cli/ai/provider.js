import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { select } from "@clack/prompts";
import { PROVIDERS, getProviderModel, isProviderConfigured } from "../../config/providers.config.js";

/**
 * Create a LanguageModel for any provider.
 * Throws with actionable message if key missing.
 */
export function createModel(providerId, modelId = null) {
  const meta = PROVIDERS[providerId];
  if (!meta) throw new Error(`Unknown provider '${providerId}'. Use: google | nvidia | inception`);

  const model = modelId || getProviderModel(providerId);

  if (providerId === "google") {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY for provider 'google'. Add it to server/.env");
    }
    return { model: google(model, { apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY }), modelId: model };
  }

  if (providerId === "nvidia") {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error("Missing NVIDIA_API_KEY for provider 'nvidia'. Generate one at https://build.nvidia.com/settings");
    }
    const nim = createOpenAICompatible({
      name: "nvidia",
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY,
    });
    return { model: nim(model), modelId: model };
  }

  if (providerId === "inception") {
    if (!process.env.INCEPTION_API_KEY) {
      throw new Error("Missing INCEPTION_API_KEY for provider 'inception'. Get one at https://platform.inceptionlabs.ai");
    }
    const inception = createOpenAICompatible({
      name: "inception",
      baseURL: "https://api.inceptionlabs.ai/v1",
      apiKey: process.env.INCEPTION_API_KEY,
    });
    return { model: inception(model), modelId: model };
  }
}


export async function selectProvider() {
  const choice = await select({
    message: "Select AI provider:",
    options: Object.values(PROVIDERS).map((p) => ({
      value: p.id,
      label: p.label,
      hint: `${getProviderModel(p.id)} ${isProviderConfigured(p.id) ? "✅" : "❌ missing " + p.envKey}`,
    })),
  });
  return { id: choice, model: getProviderModel(choice) };
}
