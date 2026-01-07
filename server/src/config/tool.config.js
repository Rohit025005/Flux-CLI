import { google } from "@ai-sdk/google";
import chalk from "chalk";

export const availableTools = [
  {
    id: 'google_search',
    name: 'Google Search',
    description: 'Access the latest information using Google search. Useful for current events, news, and real-time information.',
    getTool: () => google.tools.googleSearch({}),
    enabled: false,
  },
  {
    id: 'code_execution',
    name: 'Code Execution',
    description: 'Generate and execute code to perform calculations, solve problems, or provide accurate information.',
    getTool: () => google.tools.codeExecution({}),
    enabled: false,
  },
  {
    id: 'url_context',
    name: 'URL Context',
    description: 'Provide specific URLs that you want the model to analyze directly from the prompt. Supports up to 20 URLs per request.',
    getTool: () => google.tools.urlContext({}),
    enabled: false,
  },
];

export function getEnabledTools(runtime = {}) {
  const tools = {}

  try {
    for (const toolConfig of availableTools) {
      if (toolConfig.enabled) {
        if (toolConfig.id === "url_context") {
          tools[toolConfig.id] = google.tools.urlContext({
            urls: runtime.urls || []
          });
        } else {
          tools[toolConfig.id] = toolConfig.getTool();
        }
      }
    }

    if (Object.keys(tools).length > 0) {
      console.log(chalk.gray(`[DEBUG] Enabled tools: ${Object.keys(tools).join(', ')}`));
    } else {
      console.log(chalk.yellow('[DEBUG] No tools enabled'));
    }
    return Object.keys(tools).length > 0 ? tools : undefined
  } catch (error) {
    console.log("error in getEnabledTools")
    console.error(chalk.red('[ERROR] Failed to initialize tools:'), error.message);
    console.error(chalk.yellow('Make sure you have @ai-sdk/google version 2.0+ installed'));
    console.error(chalk.yellow('Run: npm install @ai-sdk/google@latest'));
    return undefined;
  }
}


// toogle the tool to enabled state
export function toggleTool(toolId) {
  const tool = availableTools.find(t => t.id === toolId);
  if (tool) {
    tool.enabled = !tool.enabled;
    console.log(chalk.gray(`[DEBUG] Tool ${toolId} toggled to ${tool.enabled}`));
    return tool.enabled;
  }
  console.log(chalk.red(`[DEBUG] Tool ${toolId} not found`));
  return false;
}


//enable a specific tool

export function enableTools(toolId) {
  console.log(chalk.gray('[DEBUG] enableTools called with:'), toolId);

  availableTools.forEach(tool => {
    const wasEnabled = tool.enabled;
    tool.enabled = toolId.includes(tool.id);

    if (tool.enabled !== wasEnabled) {
      console.log(chalk.gray(`[DEBUG] ${tool.id}: ${wasEnabled} → ${tool.enabled}`));
    }
  });

  const enabledCount = availableTools.filter(t => t.enabled).length;
  console.log(chalk.gray(`[DEBUG] Total tools enabled: ${enabledCount}/${availableTools.length}`));
}

/**
 * Get all enabled tool names
 */
export function getEnabledToolNames() {
  const names = availableTools.filter(t => t.enabled).map(t => t.name);
  console.log(chalk.gray('[DEBUG] getEnabledToolNames returning:'), names);
  return names;
}

/**
 * Reset all tools (disable all)
 */
export function resetTools() {
  availableTools.forEach(tool => {
    tool.enabled = false;
  });
  console.log(chalk.gray('[DEBUG] All tools have been reset (disabled)'));
}

//  helpers f unctions 
export function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

export function shouldUseGoogle(text) {
  const q = text.toLowerCase();
  const triggers = [
    "today", "now", "right now", "latest", "last",
    "price", "rate", "weather", "news", "won", "match",
    "did", "has", "is there"
  ];
  return triggers.some(t => q.includes(t));
}
