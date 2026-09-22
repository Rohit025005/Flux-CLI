import dotenv from "dotenv";
dotenv.config();

export const PROVIDERS = {
  google: {
    id: "google",
    label: "Google Gemini",
    hint: "gemini-2.5-flash (native tools)",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    modelEnv: "FLUX_MODEL",
    defaultModel: "gemini-2.5-flash",
    baseURL: null,
    supportsTools: true,
    nativeTools: ["google_search", "code_execution", "url_context"],
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    hint: "OpenAI-compatible via integrate.api.nvidia.com",
    envKey: "NVIDIA_API_KEY",
    modelEnv: "FLUX_NVIDIA_MODEL",
    defaultModel: "meta/llama-3.2-11b-vision-instruct",
    baseURL: "https://integrate.api.nvidia.com/v1",
    supportsTools: true,
    nativeTools: [],
  },
  inception: {
    id: "inception",
    label: "Inception AI",
    hint: "Mercury diffusion LLM, OpenAI-compatible",
    envKey: "INCEPTION_API_KEY",
    modelEnv: "FLUX_INCEPTION_MODEL",
    defaultModel: "mercury-2",
    baseURL: "https://api.inceptionlabs.ai/v1",
    supportsTools: true,
    nativeTools: [],
  },
};

export function getProviderModel(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`Unknown provider: ${providerId}. Choose: ${Object.keys(PROVIDERS).join(", ")}`);
  return process.env[p.modelEnv] || p.defaultModel;
}

export function isProviderConfigured(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  return Boolean(process.env[p.envKey]);
}

export function listProviders() {
  return Object.values(PROVIDERS);
}