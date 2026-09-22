import chalk from "chalk";
import boxen from "boxen";
import { text, isCancel, cancel, intro, outro, multiselect } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import prisma from "../../lib/db.js";
import { getStoredToken } from "../commands/auth/login.js"
import { AIService } from "../ai/ai-service.js";
import { selectProvider } from "../ai/provider.js";
import { ChatService } from "../../service/chat-service.js";
import {
  availableTools,
  getEnabledTools,
  enableTools,
  getEnabledToolNames,
  resetTools
} from "../../config/tool.config.js";
import { extractUrls, shouldUseGoogle } from "../../config/tool.config.js";
import { PROVIDERS } from "../../config/providers.config.js";

// Configure marked to use terminal renderer
marked.use(
  markedTerminal({
    // Styling options for terminal output
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    list: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow.bgBlack,
    del: chalk.dim.gray.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
  })
);

const chatService = new ChatService();

async function getUserFromToken() {
  const token = await getStoredToken();
  if (!token?.access_token) {
    throw new Error("Not authenticated. run `flux login` ");
  }
  const spinner = yoctoSpinner({ text: "Authenticating..." }).start();

  const user = await prisma.user.findFirst({
    where: {
      sessions: {
        some: { token: token.access_token },
      },
    },
  });

  if (!user) {
    spinner.error("User not found");
    throw new Error("User not found. Please login again.");
  }

  spinner.success(`Welcome back, ${user.name}!`);
  return user;
}


async function selectTools(providerId = "google") {
  const providerMeta = PROVIDERS[providerId];
  const providerTools = availableTools.filter(t => t.providers.includes(providerId));
  
  if (providerTools.length === 0) {
    console.log(chalk.yellow(`\n⚠️  No tools available for ${providerId}\n`));
    return false;
  }
  
  const toolOptions = providerTools.map(tool => ({
    value: tool.id,
    label: tool.name,
    hint: tool.description
  }));

  console.log(chalk.cyan("\n🛠️  Available Tools:\n"));
  console.log(chalk.gray("Use ↑↓ arrows to navigate, Space to select, Enter to confirm\n"));

  const selectedTools = await multiselect({
    message: chalk.cyan("Select tools to enable:"),
    options: toolOptions,
    required: false,
    initialValues: [],
  });

  if (isCancel(selectedTools)) {
    cancel(chalk.yellow("Tool selection cancelled"));
    process.exit(0);
  }

  console.log(chalk.gray(`[DEBUG] Selected tools: ${JSON.stringify(selectedTools)}`));

  enableTools(selectedTools);

  if (selectedTools.length === 0) {
    console.log(chalk.yellow("\n⚠️  No tools selected. AI will work without tools.\n"));
  } else {
    const toolsBox = boxen(
      chalk.green(`✅ Enabled tools:\n${selectedTools.map(id => {
        const tool = availableTools.find(t => t.id === id);
        return `  • ${tool.name}`;
      }).join('\n')}`),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "green",
        title: "🛠️  Active Tools",
        titleAlignment: "center",
      }
    );
    console.log(toolsBox);
  }

  return selectedTools.length > 0;
}

async function initConversation(userId, conversationId = null, mode = "tool", aiService = null) {
  const spinner = yoctoSpinner({ text: "loading converation..." }).start();

  const conversation = await chatService.getOrCreateConversation(
    userId,
    conversationId,
    mode
  );

  spinner.success("Conversation loaded");

  const enabledToolNames = getEnabledToolNames();
  const providerDisplay = aiService ? `\n${chalk.gray("Provider: " + aiService.providerId + " / " + aiService.modelId)}` : "";
  const toolsDisplay = enabledToolNames.length > 0
    ? `\n${chalk.gray("Active Tools:")} ${enabledToolNames.join(", ")}`
    : `\n${chalk.gray("No tools enabled")}`;

  const conversationInfo = boxen(
    `${chalk.bold("Conversation")}: ${conversation.title}\n${chalk.gray("ID: " + conversation.id)}\n${chalk.gray("Mode: " + conversation.mode)}${providerDisplay}${toolsDisplay}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      title: "💬 Tool Calling Session",
      titleAlignment: "center",
    }
  );

  console.log(conversationInfo);

  // Display existing messages if any
  if (conversation.messages?.length > 0) {
    console.log(chalk.yellow("📜 Previous messages:\n"));
    displayMessages(conversation.messages);
  }

  return conversation;
}

function displayMessages(messages) {
  messages.forEach((msg) => {
    if (msg.role === "user") {
      const userBox = boxen(chalk.white(msg.content), {
        padding: 1,
        margin: { left: 2, bottom: 1 },
        borderStyle: "round",
        borderColor: "blue",
        title: "👤 You",
        titleAlignment: "left",
      });
      console.log(userBox);
    } else if (msg.role === "assistant") {
      const renderedContent = marked.parse(msg.content);
      const assistantBox = boxen(renderedContent.trim(), {
        padding: 1,
        margin: { left: 2, bottom: 1 },
        borderStyle: "round",
        borderColor: "green",
        title: "🤖 Assistant (with tools)",
        titleAlignment: "left",
      });
      console.log(assistantBox);
    }
  });
}

async function saveMessage(conversationId, role, content) {
  return await chatService.addMessage(conversationId, role, content);
}

async function getAIResponse(conversationId, aiService) {
  const spinner = yoctoSpinner({
    text: "lemme think",
    color: "cyan"
  }).start();

  // Spinner timeout fallback - stop spinner after 30s if no response
  const spinnerTimeout = setTimeout(() => {
    spinner.stop();
    console.log("\n" + chalk.yellow("⚠ Response taking longer than expected..."));
  }, 30000);

  const dbMessages = await chatService.getMessages(conversationId);
  const aiMessages = chatService.formatMessagesForAI(dbMessages);

  const lastMsg = aiMessages[aiMessages.length - 1]?.content || "";
  const urls = extractUrls(lastMsg);
  const tools = getEnabledTools({ urls }, aiService.providerId);
  const systemPrompt = tools && Object.keys(tools).length > 0
    ? "You have access to the following tools: " + Object.keys(tools).join(", ") + ". " +
      "You MUST use the appropriate tool when: " +
      "1. User asks about current weather, news, or real-time information -> use web_search" +
      "2. User provides URLs to analyze -> use url_context" +
      "3. User asks for calculations or code execution -> use code_execution (Google only)" +
      "Do not answer from your training data for current events. Call the tool with the user's query."
    : null;


  let fullResponse = "";
  let isFirstChunk = true;
  const toolCallsDetected = [];

  try {
    // IMPORTANT: Pass tools in the streamText config
    const result = await aiService.sendMessage(
      aiMessages,
      (chunk) => {
        clearTimeout(spinnerTimeout);
        if (isFirstChunk) {
          spinner.stop();
          console.log("\n");
          const header = chalk.green.bold(" Assistant:");
          console.log(header);
          console.log(chalk.gray("─".repeat(60)));
          isFirstChunk = false;
        }
        fullResponse += chunk;
      },
      tools,
      (toolCall) => {
        toolCallsDetected.push(toolCall);
      },
      systemPrompt
    );

    clearTimeout(spinnerTimeout);

    // If no chunks received, ensure spinner is stopped
    if (isFirstChunk) {
      spinner.stop();
    }

    // Display tool calls if any
    if (toolCallsDetected.length > 0) {
      console.log("\n");
      const toolCallBox = boxen(
        toolCallsDetected.map(tc =>
          `${chalk.cyan("🔧 Tool:")} ${tc.toolName}\n${chalk.gray("Args:")} ${JSON.stringify(tc.args, null, 2)}`
        ).join("\n\n"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
          title: "🛠️  Tool Calls",
        }
      );
      console.log(toolCallBox);
    }

    // Display tool results if any
    if (result.toolResults && result.toolResults.length > 0) {
      const toolResultBox = boxen(
        result.toolResults.map(tr =>
          `${chalk.green("✅ Tool:")} ${tr.toolName}\n${chalk.gray("Result:")} ${JSON.stringify(tr.result, null, 2).slice(0, 200)}...`
        ).join("\n\n"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
          title: "📊 Tool Results",
        }
      );
      console.log(toolResultBox);
    }

    // Render markdown response (even if empty, show something)
    console.log("\n");
    const renderedMarkdown = fullResponse ? marked.parse(fullResponse) : chalk.gray("(No response generated)");
    console.log(renderedMarkdown);
    console.log(chalk.gray("─".repeat(60)));
    console.log("\n");

    return result.content;
  } catch (error) {
    clearTimeout(spinnerTimeout);
    spinner.error("Failed to get AI response");
    throw error;
  }
}

async function updateConversationTitle(conversationId, userInput, messageCount) {
  if (messageCount === 1) {
    const title = userInput.slice(0, 50) + (userInput.length > 50 ? "..." : "");
    await chatService.updateTitle(conversationId, title);
  }
}

async function chatLoop(conversation, aiService) {
  const enabledToolNames = getEnabledToolNames();

  const helpBox = boxen(
    `${chalk.gray('• Type your message and press Enter')}\n
      ${chalk.gray('• AI has access to:')} ${enabledToolNames.length > 0 ? enabledToolNames.join(", ") : "No tools"}\n
      ${chalk.gray('• Type "/provider" to switch provider, "/status" to show current')}\n
      ${chalk.gray('• Type "exit" to end conversation')}\n
      ${chalk.gray('• Press Ctrl+C to quit anytime')}`,
    {
      padding: 1,
      margin: { bottom: 1 },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
    }
  );

  console.log(helpBox);

  while (true) {
    const userInput = await text({
      message: chalk.blue("💬 Your message"),
      placeholder: "Type your message...",
      validate(value) {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty";
        }
      },
    });

    const urls = extractUrls(userInput);

    const providerMeta = PROVIDERS[aiService.providerId];
    if (providerMeta?.supportsTools) {
      if (urls.length > 0) {
        enableTools(["url_context"]);
        console.log("[DEBUG] Auto-enabled URL Context");
      } else if (shouldUseGoogle(userInput)) {
        enableTools(["web_search"]);
        console.log("[DEBUG] Auto-enabled Web Search");
      }
    }


    if (isCancel(userInput)) {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye! 👋"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      process.exit(0);
    }

    const trimmed = userInput.trim();
    if (trimmed === "/provider") {
      try {
        const picked = await selectProvider();
        if (isCancel(picked) || isCancel(picked.id)) {
          console.log(chalk.yellow("Provider switch cancelled."));
          continue;
        }
        await aiService.switchProvider(picked.id, picked.model);
      } catch (e) {
        console.log(chalk.red(`Switch failed: ${e.message}`));
      }
      continue;
    }
    if (trimmed === "/status") {
      console.log(chalk.cyan(`Provider: ${aiService.providerId} / Model: ${aiService.modelId}`));
      continue;
    }

    if (userInput.toLowerCase() === "exit") {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye! 👋"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      break;
    }

    const userBox = boxen(chalk.white(userInput), {
      padding: 1,
      margin: { left: 2, top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "blue",
      title: "👤 You",
      titleAlignment: "left",
    });
    console.log(userBox);

    await saveMessage(conversation.id, "user", userInput);
    const messages = await chatService.getMessages(conversation.id);
    const aiResponse = await getAIResponse(conversation.id, aiService);
    await saveMessage(conversation.id, "assistant", aiResponse);
    await updateConversationTitle(conversation.id, userInput, messages.length);
  }
}

//entry
export async function startToolChat(conversationId = null, { provider = "google", model = null } = {}) {
  try {
    const aiService = new AIService(provider, model);
    intro(
      boxen(chalk.bold.cyan(" flux AI - Tool Calling Mode"), {
        padding: 1,
        borderStyle: "double",
        borderColor: "cyan",
      })
    );

    const user = await getUserFromToken();

    // Select tools
    await selectTools(aiService.providerId);

    const conversation = await initConversation(user.id, conversationId, "tool", aiService);
    await chatLoop(conversation, aiService);

    // Reset tools on exit
    resetTools();

    outro(chalk.green("Thanks for using tools!"));
  } catch (error) {
    const errorBox = boxen(chalk.red(` Error: ${error.message}`), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
    });
    console.log(errorBox);
    resetTools();
    process.exit(1);
  }
}