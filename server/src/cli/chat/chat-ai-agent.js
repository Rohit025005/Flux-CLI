import chalk from "chalk";
import boxen from "boxen";
import { text, isCancel, cancel, intro, outro, confirm } from "@clack/prompts";
import { AIService } from "../ai/ai-service.js"
import { selectProvider } from "../ai/provider.js";
import { ChatService } from "../../service/chat-service.js";
import { getStoredToken } from "../commands/auth/login.js";
import prisma from "../../lib/db.js";
import { generateApplication } from "../../config/agent.config.js";
import dotenv from"dotenv";
import yoctoSpinner from "yocto-spinner";

const chatService = new ChatService();

async function getUserFromToken() {
    const token = await getStoredToken();

    if (!token?.access_token) {
        throw new Error("Not authenticated. Please run 'flux login' first.");
    }

    const user = await prisma.user.findFirst({
        where: {
            sessions: {
                some: { token: token.access_token },
            },
        },
    });

    if (!user) {
        throw new Error("User not found. Please login again.");
    }

    console.log(chalk.green(`\n✓ Welcome back, ${user.name}!\n`));
    return user;
}

async function initConversation(userId, conversationId = null, aiService = null) {
    const conversation = await chatService.getOrCreateConversation(
        userId,
        conversationId,
        "agent"
    );

    const providerLine = aiService ? `\n${chalk.gray("Provider:")} ${aiService.providerId} / ${aiService.modelId}` : "";
    const conversationInfo = boxen(
        `${chalk.bold("Conversation")}: ${conversation.title}\n` +
        `${chalk.gray("ID:")} ${conversation.id}\n` +
        `${chalk.gray("Mode:")} ${chalk.magenta("Agent (Code Generator)")}${providerLine}\n` +
        `${chalk.cyan("Working Directory:")} ${process.cwd()}`,
        {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "magenta",
            title: "🤖 Agent Mode",
            titleAlignment: "center",
        }
    );

    console.log(conversationInfo);

    return conversation;
}

async function saveMessage(conversationId, role, content) {
    return await chatService.addMessage(conversationId, role, content);
}

async function agentLoop(conversation, aiService) {
    const helpBox = boxen(
        `${chalk.cyan.bold("What can the agent do?")}\n\n` +
        `${chalk.gray('• Generate complete applications from descriptions')}\n` +
        `${chalk.gray('• Create all necessary files and folders')}\n` +
        `${chalk.gray('• Include setup instructions and commands')}\n` +
        `${chalk.gray('• Generate production-ready code')}\n\n` +
        `${chalk.yellow.bold("Examples:")}\n` +
        `${chalk.white('• "Build a todo app with React and Tailwind"')}\n` +
        `${chalk.white('• "Create a REST API with Express and MongoDB"')}\n` +
        `${chalk.white('• "Make a weather app using OpenWeatherMap API"')}\n\n` +
        `${chalk.gray('Type "/provider" to switch provider, "/status" to show current')}\n` +
        `${chalk.gray('Type "exit" to end the session')}`,
        {
            padding: 1,
            margin: { bottom: 1 },
            borderStyle: "round",
            borderColor: "cyan",
            title: "💡 Agent Instructions",
        }
    );

    console.log(helpBox);

    while (true) {
        const userInput = await text({
            message: chalk.magenta("🤖 What would you like to build?"),
            placeholder: "Describe your application...",
            validate(value) {
                if (!value || value.trim().length === 0) {
                    return "Description cannot be empty";
                }
                if (value.trim().length < 10) {
                    return "Please provide more details (at least 10 characters)";
                }
            },
        });

        if (isCancel(userInput)) {
            console.log(chalk.yellow("\n Agent session canclled\n"))
            break;
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

        if (userInput.toLowerCase() === 'exit') {
            console.log(chalk.yellow("\n Agent session ended\n"))
            break;
        }
        const userBox = boxen(chalk.white(userInput), {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "blue",
            title: "👤 Your Request",
            titleAlignment: "left",
        });
        console.log(userBox);

        await saveMessage(conversation.id, "user", userInput);

        try {
            const result = await generateApplication(
                userInput,
                aiService,
                process.cwd()
            );
            if (result && result.success) {
                const responseMessage = `Generated application: ${result.folderName}\n` +
                    `Files created: ${result.files.length}\n` +
                    `Location: ${result.appDir}\n\n` +
                    `Setup commands:\n${result.commands.join('\n')}`;

                await saveMessage(conversation.id, "assistant", responseMessage);

                const continuePrompt = await confirm({
                    message: chalk.cyan("Would you like to generate another application?"),
                    initialValue: false,
                });

                if (isCancel(continuePrompt) || !continuePrompt) {
                    console.log(chalk.yellow("\n👋 Great! Check your new application.\n"));
                    break;
                }
            } else {
                throw new Error("Generation returne no result");
            }
        } catch (error) {
            console.log("error in agentLoop");
            console.log(chalk.red(`\n Error: ${error.message}\n`));

            await saveMessage(conversation.id, "assistant", `Error: ${error.message}`);

            const retry = await confirm({
                message: chalk.cyan("Would you like to try again?"),
                initialValue: true,
            });

            if (isCancel(retry) || !retry) {
                break;
            }
        }
    }
}




export async function startAgentChat(conversationId = null, { provider = "google", model = null } = {}) {
    try {
        const aiService = new AIService(provider, model);
        intro(
            boxen(
                chalk.bold.magenta(" flux AI - Agent Mode\n\n") +
                chalk.gray("Autonomous Application Generator"),
                {
                    padding: 1,
                    borderStyle: "double",
                    borderColor: "magenta",
                }
            )
        );

        const user = await getUserFromToken();

        // Warn about file system access
        const shouldContinue = await confirm({
            message: chalk.yellow("⚠️  The agent will create files and folders in the current directory. Continue?"),
            initialValue: true,
        });

        if (isCancel(shouldContinue) || !shouldContinue) {
            cancel(chalk.yellow("Agent mode cancelled"));
            process.exit(0);
        }

        const conversation = await initConversation(user.id,   conversationId, aiService);
        await agentLoop(conversation, aiService);

        outro(chalk.green.bold("\n Thanks for using Agent Mode!"));

    } catch (error) {
        console.log("error in startAgentChat")
        const errorBox = boxen(chalk.red(` Error: ${error.message}`), {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
        });
        console.log(errorBox);
        process.exit(1);
    }
}