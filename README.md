# AskAgent

AskAgent is a minimal ChatGPT-style AI agent interface built with React, TypeScript, LangChain, Gemini 2.5 Flash, and Electron.

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
- `file_list_directory` for listing local files and folders in the Electron app
- `file_read` for reading local text files in the Electron app
- `file_write` for writing or appending local text files after user approval
- `file_delete` for deleting local files or folders after user approval
- `shell_execute` for running terminal commands after user approval
- `desktop_screenshot` for capturing the AskAgent desktop window
- `desktop_mouse_click` and `desktop_keyboard_type` for controlling the AskAgent window after user approval
- `app_open` for opening apps, files, folders, or URLs after user approval
- `permission_request` for explicit permission checks
- `playwright_browser` and `e2b_sandbox` placeholders for future Playwright and E2B SDK wiring

Desktop-only tools are available when running AskAgent through Electron. Sensitive tools interrupt with a native permission dialog before writing files, deleting files, running commands, launching apps, or controlling input.

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
- Electron

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

Run the desktop app in development:

```bash
npm run desktop:dev
```

Create an unpacked desktop app:

```bash
npm run desktop:pack
```

Create a Windows installer:

```bash
npm run desktop:build
```

The unpacked app is written to `release/win-unpacked/AskAgent.exe`, and the installer is written to `release/AskAgent Setup 0.0.0.exe`.

## Scripts

```bash
npm run dev
npm run build
npm run desktop:dev
npm run desktop:pack
npm run desktop:build
npm run preview
npm run lint
```

## Architecture

The app is intentionally small and frontend-focused. Electron wraps the Vite build for desktop use and loads the Vite dev server while running `npm run desktop:dev`.

```text
askagent/
|-- public/
|   `-- askagent-logo.svg      App logo and favicon
|-- electron/
|   |-- main.cjs               Electron main process and desktop window
|   `-- preload.cjs            Isolated preload bridge
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
5. In Electron, desktop tools go through the isolated preload bridge and Electron main process. Sensitive actions ask for permission before doing anything.
6. Gemini returns the final answer.
7. The UI shows the answer and the tools used for that specific generation.

## Notes On API Keys

This is currently a Vite renderer app. That means `VITE_GEMINI_API_KEY` is exposed to the frontend bundle, including the Electron renderer bundle.

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
