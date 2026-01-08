import chalk from "chalk";
import boxen from "boxen";
import { text, isCancel, cancel, intro, outro, multiselect } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import prisma from "../../lib/db.js";
import { getStoredToken } from "../commands/auth/login.js"
import { AIService } from "../ai/google-service.js";
import { ChatService } from "../../service/chat-service.js";
import {
  availableTools,
  getEnabledTools,
  enableTools,
  getEnabledToolNames,
  resetTools
} from "../../config/tool.config.js";
import { extractUrls, shouldUseGoogle } from "../../config/tool.config.js";

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

const aiService = new AIService();
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


async function selectTools() {
  const toolOptions = availableTools.map(tool => ({
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
    initialValues: [], // Start with nothing selected
  });

  if (isCancel(selectedTools)) {
    cancel(chalk.yellow("Tool selection cancelled"));
    process.exit(0);
  }

  // Debug: show what was selected
  console.log(chalk.gray(`[DEBUG] Selected tools: ${JSON.stringify(selectedTools)}`));

  // Enable the tools
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

async function initConversation(userId, conversationId = null, mode = "tool") {
  const spinner = yoctoSpinner({ text: "loading converation..." }).start();

  const conversation = await chatService.getOrCreateConversation(
    userId,
    conversationId,
    mode
  );

  spinner.success("Conversation loaded");

  const enabledToolNames = getEnabledToolNames();
  const toolsDisplay = enabledToolNames.length > 0
    ? `\n${chalk.gray("Active Tools:")} ${enabledToolNames.join(", ")}`
    : `\n${chalk.gray("No tools enabled")}`;

  const conversationInfo = boxen(
    `${chalk.bold("Conversation")}: ${conversation.title}\n${chalk.gray("ID: " + conversation.id)}\n${chalk.gray("Mode: " + conversation.mode)}${toolsDisplay}`,
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

async function getAIResponse(conversationId) {
  const spinner = yoctoSpinner({
    text: "lemme think",
    color: "cyan"
  }).start();

  const dbMessages = await chatService.getMessages(conversationId);
  const aiMessages = chatService.formatMessagesForAI(dbMessages);

  const lastMsg = aiMessages[aiMessages.length - 1]?.content || "";
  const urls = extractUrls(lastMsg);
  const tools = getEnabledTools({ urls });


  let fullResponse = "";
  let isFirstChunk = true;
  const toolCallsDetected = [];

  try {
    // IMPORTANT: Pass tools in the streamText config
    const result = await aiService.sendMessage(
      aiMessages,
      (chunk) => {
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
      }
    );

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

    // Render markdown response
    console.log("\n");
    const renderedMarkdown = marked.parse(fullResponse);
    console.log(renderedMarkdown);
    console.log(chalk.gray("─".repeat(60)));
    console.log("\n");

    return result.content;
  } catch (error) {
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

async function chatLoop(conversation) {
  const enabledToolNames = getEnabledToolNames();

  const helpBox = boxen(
    `${chalk.gray('• Type your message and press Enter')}\n
      ${chalk.gray('• AI has access to:')} ${enabledToolNames.length > 0 ? enabledToolNames.join(", ") : "No tools"}\n
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

    if (urls.length > 0) {
      enableTools(["url_context"]);
      console.log("[DEBUG] Auto-enabled URL Context");
    } else if (shouldUseGoogle(userInput)) {
      enableTools(["google_search"]);
      console.log("[DEBUG] Auto-enabled Google Search");
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
    const aiResponse = await getAIResponse(conversation.id);
    await saveMessage(conversation.id, "assistant", aiResponse);
    await updateConversationTitle(conversation.id, userInput, messages.length);
  }
}

//entry
export async function startToolChat(conversationId = null) {
  try {
    intro(
      boxen(chalk.bold.cyan(" flux AI - Tool Calling Mode"), {
        padding: 1,
        borderStyle: "double",
        borderColor: "cyan",
      })
    );

    const user = await getUserFromToken();

    // Select tools
    await selectTools();

    const conversation = await initConversation(user.id, conversationId, "tool");
    await chatLoop(conversation);

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