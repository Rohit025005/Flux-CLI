import { streamText, generateText } from "ai";
import chalk from "chalk";
import { createModel } from "./provider.js";
import { getProviderModel } from "../../config/providers.config.js";

export class AIService {
  constructor(providerId = "google", modelId = null) {
    this.providerId = providerId;
    this.modelId = modelId || getProviderModel(providerId);
    const created = createModel(this.providerId, this.modelId);
    // if createModel returns {model, modelId}, unwrap; if returns LanguageModel directly, use directly
    this.model = created.model ?? created;
    if (created.modelId) this.modelId = created.modelId;
  }

  async switchProvider(newProviderId, newModelId = null) {
    this.providerId = newProviderId;
    this.modelId = newModelId || getProviderModel(newProviderId);
    const created = createModel(this.providerId, this.modelId);
    this.model = created.model ?? created;
    if (created.modelId) this.modelId = created.modelId;
    console.log(chalk.green(`✓ Switched to ${this.providerId} / ${this.modelId}`));
  }

  async sendMessage(messages, onChunk, tools = undefined, onToolCall = null, systemPrompt = null) {
    const streamConfig = { model: this.model, messages };
    if (systemPrompt) {
      streamConfig.system = systemPrompt;
    }
    if (tools && Object.keys(tools).length > 0) {
      streamConfig.tools = tools;
      streamConfig.maxSteps = 5;
      console.log(chalk.gray(`[DEBUG] Tools enabled: ${Object.keys(tools).join(", ")}`));
    }
    const result = streamText(streamConfig);
    let fullResponse = "";
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      if (onChunk) onChunk(chunk);
    }
    const fullResult = await result;
    const toolCalls = [];
    const toolResults = [];
    if (fullResult.steps && Array.isArray(fullResult.steps)) {
      for (const step of fullResult.steps) {
        if (step.toolCalls?.length) {
          for (const tc of step.toolCalls) {
            toolCalls.push(tc);
            if (onToolCall) onToolCall(tc);
          }
        }
        if (step.toolResults?.length) toolResults.push(...step.toolResults);
      }
    }
    return { content: fullResponse, finishReason: fullResult.finishReason, usage: fullResult.usage, toolCalls, toolResults, steps: fullResult.steps };
  }

  async getMessage(messages, tools = undefined) {
    const result = await this.sendMessage(messages, null, tools);
    return result.content;
  }

  async generateStructured(schema, prompt) {
    // Keep as-is. Inception lacks native json_schema, so caller
    // (agent.config.js) must keep manual JSON-recovery fallback.
    const result = await generateText({ model: this.model, schema, prompt });
    return result.object;
  }
}
