# AskAgent

AskAgent is a minimal ChatGPT-style AI agent interface built with React, TypeScript, LangChain, and Gemini 2.5 Flash.

It exists as a clean starter for experimenting with tool-using AI agents in the browser. The app lets a user chat with an agent that can decide when to call tools, run those tools, and then return a final answer with a visible "Tools used" panel for each response.

## Features

- Dark, focused chat interface
- Gemini 2.5 Flash via LangChain
- Tool-using agent loop
- Per-response tool usage display
- Right-aligned user messages and left-aligned agent responses
- Scrollable chat history
- Custom AskAgent SVG logo and favicon

## Agent Tools

AskAgent currently includes:

- `calculator` for arithmetic and numeric questions
- `current_datetime` for date and time questions
- `web_search` for general web lookups using DuckDuckGo instant answers
- `wikipedia_lookup` for encyclopedia-style Wikipedia summaries

## Tech Stack

- React
- TypeScript
- Vite
- LangChain JS
- `@langchain/google`
- Gemini 2.5 Flash
- Zod
- Lucide React
- CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Add your Gemini API key:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Run the development server:

```bash
npm run dev
```

On Windows PowerShell, use:

```powershell
npm.cmd run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Architecture

The app is intentionally small and frontend-focused.

```text
askagent/
|-- public/
|   `-- askagent-logo.svg      App logo and favicon
|-- src/
|   |-- App.tsx                Main UI, agent loop, tool definitions, Gemini/LangChain wiring
|   |-- main.tsx               React entry point
|   |-- styles.css             Layout, chat UI, sidebar, message styling
|   `-- vite-env.d.ts          Vite TypeScript environment types
|-- .env.example               Example environment variables
|-- index.html                 Vite HTML shell
|-- package.json               Scripts and dependencies
|-- tsconfig.json              TypeScript project references
|-- vite.config.ts             Vite configuration
`-- README.md                  Project documentation
```

The chat flow works like this:

1. The user submits a prompt.
2. AskAgent appends the user message and a loading agent message.
3. LangChain sends the conversation to Gemini 2.5 Flash with tools bound.
4. If Gemini requests tool calls, AskAgent runs those tools locally.
5. Tool results are sent back to Gemini.
6. Gemini returns the final answer.
7. The UI shows the answer and the tools used for that specific generation.

## Notes On API Keys

This is currently a browser-only Vite app. That means `VITE_GEMINI_API_KEY` is exposed to the frontend bundle.

This is acceptable for local development and experiments, but not for a public production deployment. For production, move the LangChain/Gemini agent call behind a backend API route so the key stays private.

## Contributing

Contributions should keep the project focused: a clean AI agent chat interface with practical tools.

Before opening a pull request:

```bash
npm run build
npm run lint
```

Good contribution areas:

- Better agent tools
- Backend API proxy for production key safety
- Streaming responses for the LangChain agent loop
- Chat persistence
- Tool result citations and richer source display
- Accessibility and responsive UI improvements

## Project Quality

AskAgent is designed to be a serious starter project, not a throwaway demo. The codebase is small, typed, linted, and structured so the core agent behavior is easy to inspect and extend.
