import { tool } from "ai";
import { z } from "zod";
import chalk from "chalk";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

let googleTools = {};
try {
  const { google } = await import("@ai-sdk/google");
  googleTools = {
    google_search: tool({
      description: "Access the latest information using Google search (Gemini native).",
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const searchTool = google.tools.googleSearch({});
        return searchTool.execute({ query });
      },
    }),
    code_execution: tool({
      description: "Generate and execute code to perform calculations (Gemini native).",
      parameters: z.object({ code: z.string() }),
      execute: async ({ code }) => {
        const execTool = google.tools.codeExecution({});
        return execTool.execute({ code });
      },
    }),
    url_context: tool({
      description: "Analyze specific URLs directly from the prompt (Gemini native).",
      parameters: z.object({ urls: z.array(z.string().url()) }),
      execute: async ({ urls }) => {
        const urlTool = google.tools.urlContext({ urls });
        return urlTool.execute({ urls });
      },
    }),
  };
} catch {
  console.log(chalk.yellow("[WARN] @ai-sdk/google not available, Google-native tools disabled"));
}

export const tavilySearch = tool({
  description: "Search the web for current information using Tavily API.",
  parameters: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5),
  }),
  execute: async ({ query, maxResults }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY not set in server/.env");
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: true,
      }),
    });
    const data = await res.json();
    return data.results?.map(r => ({ title: r.title, url: r.url, content: r.content })) || [];
  },
});

const urlContext = tool({
  description: "Fetch and extract readable content from URLs using Mozilla Readability.",
  parameters: z.object({
    urls: z.array(z.string().url()).describe("URLs to fetch and extract"),
  }),
  execute: async ({ urls }) => {
    const results = [];
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FluxBot/1.0)" } });
        const html = await res.text();
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        results.push({
          url,
          title: article?.title || null,
          textContent: article?.textContent?.slice(0, 8000) || null,
        });
      } catch (e) {
        results.push({ url, error: e.message });
      }
    }
    return results;
  },
});

export const availableTools = [
  {
    id: "web_search",
    name: "Web Search (Tavily)",
    description: "Search the web for current information",
    tool: tavilySearch,
    enabled: false,
    providers: ["google", "nvidia", "inception"],
  },
  {
    id: "url_context",
    name: "URL Context",
    description: "Extract readable content from URLs",
    tool: urlContext,
    enabled: false,
    providers: ["google", "nvidia", "inception"],
  },
  {
    id: "google_search",
    name: "Google Search (Gemini)",
    description: "Gemini native Google search grounding",
    tool: googleTools.google_search,
    enabled: false,
    providers: ["google"],
  },
  {
    id: "code_execution",
    name: "Code Execution (Gemini)",
    description: "Gemini native code execution",
    tool: googleTools.code_execution,
    enabled: false,
    providers: ["google"],
  },
];

export function getEnabledTools(runtime = {}, providerId = "google") {
  const tools = {};
  try {
    for (const t of availableTools) {
      if (!t.enabled) continue;
      if (!t.providers.includes(providerId)) continue;
      if (t.id === "url_context" && runtime.urls) {
        tools[t.id] = t.tool;
      } else {
        tools[t.id] = t.tool;
      }
    }
    if (Object.keys(tools).length > 0) {
      console.log(chalk.gray(`[DEBUG] Enabled tools for ${providerId}: ${Object.keys(tools).join(", ")}`));
    } else {
      console.log(chalk.yellow(`[DEBUG] No tools enabled for ${providerId}`));
    }
    return Object.keys(tools).length > 0 ? tools : undefined;
  } catch (error) {
    console.error(chalk.red("[ERROR] Failed to initialize tools:"), error.message);
    return undefined;
  }
}

export function toggleTool(toolId) {
  const t = availableTools.find(x => x.id === toolId);
  if (t) {
    t.enabled = !t.enabled;
    console.log(chalk.gray(`[DEBUG] Tool ${toolId} toggled to ${t.enabled}`));
    return t.enabled;
  }
  console.log(chalk.red(`[DEBUG] Tool ${toolId} not found`));
  return false;
}

export function enableTools(toolIds) {
  const ids = Array.isArray(toolIds) ? toolIds : [toolIds];
  console.log(chalk.gray("[DEBUG] enableTools called with:"), ids);
  availableTools.forEach(t => {
    const was = t.enabled;
    t.enabled = ids.includes(t.id);
    if (t.enabled !== was) {
      console.log(chalk.gray(`[DEBUG] ${t.id}: ${was} → ${t.enabled}`));
    }
  });
  console.log(chalk.gray(`[DEBUG] Total tools enabled: ${availableTools.filter(x => x.enabled).length}/${availableTools.length}`));
}

export function getEnabledToolNames() {
  const names = availableTools.filter(t => t.enabled).map(t => t.name);
  console.log(chalk.gray("[DEBUG] getEnabledToolNames returning:"), names);
  return names;
}

export function resetTools() {
  availableTools.forEach(t => { t.enabled = false; });
  console.log(chalk.gray("[DEBUG] All tools have been reset (disabled)"));
}

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