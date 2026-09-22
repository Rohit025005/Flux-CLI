import chalk from "chalk";
import { Command } from "commander";
import yoctoSpinner from "yocto-spinner";
import { getStoredToken } from "../auth/login.js";
import prisma from "../../../lib/db.js";
import { select } from "@clack/prompts";
import { startChat } from "../../chat/chat-ai.js";
import { startToolChat } from "../../chat/chat-ai-tools.js";
import { startAgentChat } from "../../chat/chat-ai-agent.js";
import { selectProvider } from "../../ai/provider.js";
import { getProviderModel, PROVIDERS } from "../../../config/providers.config.js";

const wakeUpAction = async (opts) => {
  const token = await getStoredToken();
  if (!token?.access_token) {
    console.log(chalk.red("Not authenticated. Please login."));
    return;
  }

  const spinner = yoctoSpinner({ text: "Fetching User Information..." });
  spinner.start();
  const user = await prisma.user.findFirst({
    where: { sessions: { some: { token: token.access_token } } },
    select: { id: true, name: true, email: true, image: true },
  });
  spinner.stop();
  if (!user) { console.log(chalk.red("User not found.")); return; }
  console.log(chalk.green(`\nWelcome back, ${user.name}!\n`));

  // 1. Provider (flag or interactive)
  let provider = opts.provider;
  let model = opts.model;
  if (provider && !PROVIDERS[provider]) {
    console.log(chalk.red(`Unknown --provider '${provider}'. Use: ${Object.keys(PROVIDERS).join(" | ")}`));
    return;
  }
  if (!provider) {
    const picked = await selectProvider();
    provider = picked.id;
    model = picked.model;
  }
  if (!model) model = getProviderModel(provider);
  console.log(chalk.cyan(`Provider: ${provider} / Model: ${model}\n`));

  // 2. Mode (existing)
  const choice = await select({
    message: "Select an option:",
    options: [
      { value: "chat", label: "Chat", hint: "Simple chat with AI" },
      { value: "tool", label: "Tool Calling", hint: "Chat with tools (Google Search, Code Execution)" },
      { value: "agent", label: "Agentic Mode", hint: "Advanced AI agent" },
    ],
  });

  switch (choice) {
    case "chat": await startChat("chat", undefined, { provider, model }); break;
    case "tool": await startToolChat(null, { provider, model }); break;
    case "agent": await startAgentChat(null, { provider, model }); break;
  }
};

export const wakeUp = new Command("arise")
  .alias("wakeup")
  .description("Wake up the AI")
  .option("--provider <id>", "AI provider: google | nvidia | inception")
  .option("--model <name>", "Model name (overrides env default)")
  .action(wakeUpAction);
