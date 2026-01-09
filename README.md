
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
```


## Usage/Examples

First login using
```
flux login
```
Authenticates using GitHub OAuth and stores session locally.

Start using the Flux-CLI using:

```
flux arise  OR  flux wakeup
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

