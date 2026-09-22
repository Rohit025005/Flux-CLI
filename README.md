
# Flux CLI

Flux CLI lets you interact with AI models, execute tools, and manage conversations without leaving your terminal.

Features

💬 Interactive AI chat in terminal
🧠 Tool calling support (functions invoked by AI)
🌐 Web search & URL context (experimental)
🔐 OAuth-based login (GitHub)
🗂️ Conversation history stored in database
⚙️Modular command system for easy extension
## Tech Stack

**Client:** Next.js,Commander.js, TailwindCSS

**Server:** Node.js + Express.js ,Prisma ORM ,PostgreSQL (Neon DB) Better Auth  ,


## Installation

Install my-project with npm

    1. Clone the repo
    
    git clone https://github.com/Rohit025005/Flux-CLI.git


cd Flux-CLI

    2. Install dependencies
```bash
cd server
npm install
npx prisma generate
```
```bash
cd client
npm install
```

## Environment Variables

    3. Setup environment variables
Create a .env file inside server/:
```bash

PORT=3005

DATABASE_URL= db url

BETTER_AUTH_URL=http://localhost:3005 # base URL of your app

GITHUB_CLIENT_ID= github client id

GITHUB_CLIENT_SECRET= github client secret
PRISMA_CLIENT_ENGINE_TYPE=binary


GOOGLE_GENERATIVE_AI_API_KEY=your gemini api key

FLUX_MODEL=gemini-2.5-flash

NVIDIA_API_KEY=your nvidia api key

FLUX_NVIDIA_MODEL=nvidia/llama-3.1-70b-instruct

INCEPTION_API_KEY=your inception api key

FLUX_INCEPTION_MODEL=mercury-2

TAVILY_API_KEY=your tavily api key (for web search)
```

## Providers

Flux CLI supports multiple AI providers:

| Provider | Models | Tool Support | Notes |
|----------|--------|--------------|-------|
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro | ✅ Full (native + generic) | Native: google_search, code_execution, url_context |
| NVIDIA NIM | llama-3.1-70b, nemotron-3-ultra, etc. | ✅ Generic (web_search, url_context) | OpenAI-compatible API |
| Inception AI | mercury-2, mercury-coder-small | ✅ Generic (web_search, url_context) | OpenAI-compatible API, diffusion LLM |

## Usage/Examples
First go in server login through github
```
flux login
```
Authenticates using GitHub OAuth and stores session locally.

Start Flux-CLI using Commands:

```
flux arise  OR  flux wakeup
```

### Provider Selection
```
flux arise                                    # Interactive provider + mode selection
flux arise --provider google                  # Use Google Gemini
flux arise --provider nvidia                  # Use NVIDIA NIM
flux arise --provider inception               # Use Inception AI
flux arise --provider nvidia --model meta/llama-3.1-70b-instruct  # Custom model
```

### In-Chat Commands
```
/provider    # Switch AI provider mid-session (history preserved)
/status      # Show current provider and model
exit         # End conversation
```

Available Commands

```
flux logout
```
Log Out from current session

```
flux whoami
```
Gives information about currently logged in user

