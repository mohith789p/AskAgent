import { ChatGoogle } from '@langchain/google'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
  type MessageContent,
  type ToolCall,
} from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { z } from 'zod'
import {
  Camera,
  ChevronDown,
  Circle,
  FolderOpen,
  LoaderCircle,
  Mic,
  Plus,
  SendHorizontal,
  Sparkles,
  SquareTerminal,
  Volume2,
} from 'lucide-react'

type ChatMessage = {
  id: string
  role: 'user' | 'model'
  text: string
  toolsUsed?: string[]
}

const modelName = 'gemini-2.5-flash'



const actionChips = [
  { label: 'Explore current directory', icon: FolderOpen },
  { label: 'Run a terminal command', icon: SquareTerminal },
  { label: 'Take a window screenshot', icon: Camera },
]

const agentTools = [
  tool(
    ({ expression }) => {
      const normalizedExpression = expression.replace(/\s+/g, '')

      if (!/^[\d+\-*/().%^]+$/.test(normalizedExpression)) {
        return 'Invalid expression. Use numbers and math operators only.'
      }

      const result = Function(`"use strict"; return (${normalizedExpression.replaceAll('^', '**')})`)()

      if (typeof result !== 'number' || !Number.isFinite(result)) {
        return 'The expression did not produce a finite number.'
      }

      return `${expression} = ${result}`
    },
    {
      name: 'calculator',
      description:
        'Evaluate arithmetic expressions. Use this for math, calculations, percentages, and numeric comparisons.',
      schema: z.object({
        expression: z
          .string()
          .describe('A math expression using numbers and operators such as +, -, *, /, %, ^, and parentheses.'),
      }),
    },
  ),
  tool(
    ({ timezone }) => {
      const now = new Date()
      const requestedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: requestedTimezone,
      }).format(now)
    },
    {
      name: 'current_datetime',
      description:
        'Get the current date and time. Use this when the user asks about today, now, the date, or the time.',
      schema: z.object({
        timezone: z
          .string()
          .optional()
          .describe('Optional IANA timezone, for example Asia/Kolkata or America/New_York.'),
      }),
    },
  ),
  tool(
    async ({ query }) => {
      const searchUrl = new URL('https://api.duckduckgo.com/')
      searchUrl.searchParams.set('q', query)
      searchUrl.searchParams.set('format', 'json')
      searchUrl.searchParams.set('no_html', '1')
      searchUrl.searchParams.set('skip_disambig', '1')

      const response = await fetch(searchUrl)

      if (!response.ok) {
        return `Search failed with status ${response.status}.`
      }

      const data = (await response.json()) as {
        AbstractText?: string
        Heading?: string
        RelatedTopics?: Array<{
          Text?: string
          FirstURL?: string
        }>
      }
      const relatedTopics =
        data.RelatedTopics?.filter((topic) => topic.Text)
          .slice(0, 5)
          .map((topic) => ({
            title: topic.Text?.split(' - ')[0],
            snippet: topic.Text,
            url: topic.FirstURL,
          })) ?? []

      return JSON.stringify({
        query,
        answer: data.AbstractText || null,
        heading: data.Heading || null,
        results: relatedTopics,
      })
    },
    {
      name: 'web_search',
      description:
        'Search the web for general information. Use this for broad lookups, recent topics, or when the answer may need external context.',
      schema: z.object({
        query: z.string().describe('The search query.'),
      }),
    },
  ),
  tool(
    async ({ query }) => {
      const searchUrl = new URL('https://en.wikipedia.org/w/rest.php/v1/search/page')
      searchUrl.searchParams.set('q', query)
      searchUrl.searchParams.set('limit', '3')

      const searchResponse = await fetch(searchUrl, {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!searchResponse.ok) {
        return `Wikipedia search failed with status ${searchResponse.status}.`
      }

      const searchData = (await searchResponse.json()) as {
        pages?: Array<{
          title?: string
          description?: string
          excerpt?: string
          key?: string
        }>
      }
      const page = searchData.pages?.[0]

      if (!page?.key) {
        return `No Wikipedia page found for "${query}".`
      }

      const summaryResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      )

      if (!summaryResponse.ok) {
        return JSON.stringify({
          query,
          title: page.title,
          description: page.description,
          excerpt: page.excerpt,
        })
      }

      const summary = (await summaryResponse.json()) as {
        title?: string
        description?: string
        extract?: string
        content_urls?: {
          desktop?: {
            page?: string
          }
        }
      }

      return JSON.stringify({
        query,
        title: summary.title ?? page.title,
        description: summary.description ?? page.description,
        summary: summary.extract ?? page.excerpt,
        url: summary.content_urls?.desktop?.page,
      })
    },
    {
      name: 'wikipedia_lookup',
      description:
        'Look up encyclopedia-style background from Wikipedia. Use this for people, places, concepts, history, science, and well-known entities.',
      schema: z.object({
        query: z.string().describe('The Wikipedia topic or search query.'),
      }),
    },
  ),
]

const desktopTools = [
  tool(
    async ({ path }) => invokeDesktopTool('file_list_directory', { path }),
    {
      name: 'file_list_directory',
      description:
        'List files and folders on the desktop machine. Use this to inspect directories before reading or writing files.',
      schema: z.object({
        path: z.string().default('.').describe('Directory path to list. Relative paths resolve from the app workspace.'),
      }),
    },
  ),
  tool(
    async ({ path }) => invokeDesktopTool('file_read', { path }),
    {
      name: 'file_read',
      description:
        'Read a text file from the desktop machine. Use this before editing files so you can understand existing contents.',
      schema: z.object({
        path: z.string().describe('File path to read. Relative paths resolve from the app workspace.'),
      }),
    },
  ),
  tool(
    async ({ path, content, append }) => invokeDesktopTool('file_write', { path, content, append }),
    {
      name: 'file_write',
      description:
        'Write or append text to a file on the desktop machine. This always asks the user for permission before writing.',
      schema: z.object({
        path: z.string().describe('File path to write. Relative paths resolve from the app workspace.'),
        content: z.string().describe('Text content to write or append.'),
        append: z.boolean().optional().describe('Append instead of replacing the file.'),
      }),
    },
  ),
  tool(
    async ({ path, recursive, force }) => invokeDesktopTool('file_delete', { path, recursive, force }),
    {
      name: 'file_delete',
      description:
        'Delete a file or folder on the desktop machine. This always asks the user for permission before deleting.',
      schema: z.object({
        path: z.string().describe('File or folder path to delete.'),
        recursive: z.boolean().optional().describe('Allow deleting a folder recursively.'),
        force: z.boolean().optional().describe('Ignore missing paths and some filesystem errors.'),
      }),
    },
  ),
  tool(
    async ({ command, cwd, timeoutMs }) => invokeDesktopTool('shell_execute', { command, cwd, timeoutMs }),
    {
      name: 'shell_execute',
      description:
        'Run a terminal or shell command on the desktop machine. This always asks the user for permission before execution.',
      schema: z.object({
        command: z.string().describe('Shell command to run.'),
        cwd: z.string().optional().describe('Working directory. Relative paths resolve from the app workspace.'),
        timeoutMs: z.number().optional().describe('Command timeout in milliseconds. Defaults to 30000.'),
      }),
    },
  ),
  tool(
    async () => invokeDesktopTool('desktop_screenshot', {}),
    {
      name: 'desktop_screenshot',
      description:
        'Capture a PNG screenshot of the AskAgent desktop window. Use this for visual inspection of the current app state.',
      schema: z.object({}),
    },
  ),
  tool(
    async ({ x, y }) => invokeDesktopTool('desktop_mouse_click', { x, y }),
    {
      name: 'desktop_mouse_click',
      description:
        'Click inside the AskAgent window at x/y coordinates. This asks permission before controlling input.',
      schema: z.object({
        x: z.number().describe('X coordinate inside the app window.'),
        y: z.number().describe('Y coordinate inside the app window.'),
      }),
    },
  ),
  tool(
    async ({ text }) => invokeDesktopTool('desktop_keyboard_type', { text }),
    {
      name: 'desktop_keyboard_type',
      description:
        'Type text into the focused control inside the AskAgent window. This asks permission before controlling input.',
      schema: z.object({
        text: z.string().describe('Text to type.'),
      }),
    },
  ),
  tool(
    async ({ target }) => invokeDesktopTool('app_open', { target }),
    {
      name: 'app_open',
      description:
        'Open an app, file path, folder path, or URL using the operating system. This asks permission before launching.',
      schema: z.object({
        target: z.string().describe('Application path, file/folder path, or URL to open.'),
      }),
    },
  ),
  tool(
    async ({ action, url }) => invokeDesktopTool('playwright_browser', { action, url }),
    {
      name: 'playwright_browser',
      description:
        'Placeholder for a Playwright browser toolkit. Currently reports setup requirements until Playwright browser automation is fully wired.',
      schema: z.object({
        action: z.string().describe('Requested browser action, such as open, click, type, screenshot, or inspect.'),
        url: z.string().optional().describe('URL for browser actions that need a page.'),
      }),
    },
  ),
  tool(
    async ({ task }) => invokeDesktopTool('e2b_sandbox', { task }),
    {
      name: 'e2b_sandbox',
      description:
        'Placeholder for E2B remote sandbox execution. Currently reports setup requirements until E2B SDK/API key wiring is added.',
      schema: z.object({
        task: z.string().describe('Sandbox task to run.'),
      }),
    },
  ),
  tool(
    async ({ title, message, detail }) => invokeDesktopTool('permission_request', { title, message, detail }),
    {
      name: 'permission_request',
      description:
        'Ask the user for explicit permission before a sensitive action. File writes, deletes, shell execution, app launching, mouse, and keyboard tools already do this automatically.',
      schema: z.object({
        title: z.string().optional().describe('Permission dialog title.'),
        message: z.string().optional().describe('Permission dialog message.'),
        detail: z.string().optional().describe('Extra detail shown to the user.'),
      }),
    },
  ),
]

function invokeDesktopTool(name: string, input: Record<string, unknown>) {
  if (!window.askAgentDesktop) {
    return JSON.stringify({
      ok: false,
      error: 'Desktop tools are only available inside the Electron app.',
    })
  }

  return window.askAgentDesktop.invokeTool(name, input).then((result) => JSON.stringify(result))
}

function createId() {
  return crypto.randomUUID()
}

function toLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
  return messages.map((message) =>
    message.role === 'user' ? new HumanMessage(message.text) : new AIMessage(message.text),
  )
}

function readMessageContent(content: MessageContent) {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((block) => {
      if (typeof block === 'string') {
        return block
      }

      if ('text' in block && typeof block.text === 'string') {
        return block.text
      }

      return ''
    })
    .join('')
    .trim()
}

async function runToolCall(toolCall: ToolCall, availableToolByName: Map<string, StructuredToolInterface>) {
  const selectedTool = availableToolByName.get(toolCall.name)

  if (!selectedTool) {
    return new ToolMessage({
      content: `Tool "${toolCall.name}" is not available.`,
      tool_call_id: toolCall.id ?? createId(),
      status: 'error',
    })
  }

  try {
    const result = await selectedTool.invoke(toolCall)

    if (result instanceof ToolMessage) {
      return result
    }

    return new ToolMessage({
      content: typeof result === 'string' ? result : JSON.stringify(result),
      name: toolCall.name,
      tool_call_id: toolCall.id ?? createId(),
    })
  } catch (toolError) {
    const message =
      toolError instanceof Error ? toolError.message : `Tool "${toolCall.name}" failed.`

    return new ToolMessage({
      content: message,
      name: toolCall.name,
      tool_call_id: toolCall.id ?? createId(),
      status: 'error',
    })
  }
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  const availableTools = useMemo(
    () => (window.askAgentDesktop ? [...agentTools, ...desktopTools] : agentTools),
    [],
  )
  const availableToolByName = useMemo(
    () => new Map<string, StructuredToolInterface>(availableTools.map((agentTool) => [agentTool.name, agentTool])),
    [availableTools],
  )
  const agent = useMemo(() => {
    if (!apiKey) {
      return null
    }

    return new ChatGoogle({
      apiKey,
      model: modelName,
    }).bindTools(availableTools)
  }, [apiKey, availableTools])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = prompt.trim()

    if (!text || isLoading) {
      return
    }

    if (!agent) {
      setError('Add VITE_GEMINI_API_KEY to .env.local, then restart the dev server.')
      return
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      text,
    }
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: 'model',
      text: '',
      toolsUsed: [],
    }
    const nextMessages = [...messages, userMessage]

    setMessages([...nextMessages, assistantMessage])
    setPrompt('')
    setError('')
    setIsLoading(true)

    try {
      const agentMessages: BaseMessage[] = [
        new SystemMessage(
          'You are a helpful, concise AI agent. Use tools when they improve accuracy, especially for math, current date/time, web search, Wikipedia background, and desktop tasks. For desktop tasks, inspect before modifying. Sensitive desktop tools ask the user for permission before writing, deleting, executing shell commands, launching apps, or controlling input. If permission is denied, stop that action and explain what was not done. After tools return, answer naturally and cite URLs from tool results when available.',
        ),
        ...toLangChainMessages(nextMessages),
      ]
      let responseText = ''
      const toolsUsed = new Set<string>()

      for (let step = 0; step < 4; step += 1) {
        const response = await agent.invoke(agentMessages)
        agentMessages.push(response)

        const toolCalls = response.tool_calls ?? []

        if (toolCalls.length === 0) {
          responseText = readMessageContent(response.content)
          break
        }

        toolCalls.forEach((toolCall) => toolsUsed.add(toolCall.name))
        const toolMessages = await Promise.all(
          toolCalls.map((toolCall) => runToolCall(toolCall, availableToolByName)),
        )
        agentMessages.push(...toolMessages)
      }

      if (!responseText) {
        responseText = 'I used the available tools, but I could not produce a final answer.'
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, text: responseText, toolsUsed: Array.from(toolsUsed) }
            : message,
        ),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Something went wrong while contacting AskAgent.'
      setError(message)
      setMessages((currentMessages) =>
        currentMessages.filter((messageItem) => messageItem.id !== assistantMessage.id),
      )
    } finally {
      setIsLoading(false)
    }
  }

  function renderGenerationLoader() {
    return (
      <span className="generating" aria-label="Generating response">
        <LoaderCircle size={22} />
      </span>
    )
  }

  return (
    <div className="chat-app">
      <main className="main-panel">
        <header className="topbar">
          <button className="model-button" type="button">
            <img src="./askagent-logo.svg" alt="AskAgent logo" className="topbar-logo" />
            <span>AskAgent</span>
            <ChevronDown size={18} />
          </button>
          <div className="top-actions">
            <div className="plus-button" aria-label="Active model">
              <Sparkles size={20} fill="currentColor" />
              <span>Agent</span>
            </div>
            <button className="icon-button dotted" type="button" aria-label="Status">
              <Circle size={20} />
            </button>
          </div>
        </header>

        <section className={`conversation${messages.length === 0 ? ' empty' : ''}`}>
          {messages.length === 0 ? (
            <>
              <h1>What would you like the agent to work on?</h1>
              {!apiKey && (
                <p className="setup-note">
                  Add your Gemini API key as <code>VITE_GEMINI_API_KEY</code> to start
                  chatting.
                </p>
              )}
            </>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-avatar">
                    {message.role === 'user' ? 'MP' : <Sparkles size={17} />}
                  </div>
                  <div className="message-bubble">
                    {message.role === 'model' && (
                      <div className="tool-panel">
                        <span>Tools used</span>
                        <div className="tool-list">
                          {(message.toolsUsed?.length ? message.toolsUsed : ['None']).map(
                            (toolName) => (
                              <span className="tool-pill" key={toolName}>
                                {toolName}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                    {message.text || renderGenerationLoader()}
                  </div>
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <div className={`composer-wrap${messages.length === 0 ? ' empty' : ''}`}>
          {error && <p className="error-message">{error}</p>}
          <form className="composer" onSubmit={handleSubmit}>
            <button className="composer-icon" type="button" aria-label="Add attachment">
              <Plus size={27} strokeWidth={1.6} />
            </button>
            <input
              type="text"
              placeholder="Ask anything"
              aria-label="Ask anything"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button className="composer-icon mic" type="button" aria-label="Start voice input">
              <Mic size={22} />
            </button>
            {prompt.trim() ? (
              <button
                className="send-button"
                type="submit"
                aria-label="Send prompt"
                disabled={isLoading}
              >
                {isLoading ? <LoaderCircle size={22} /> : <SendHorizontal size={20} />}
              </button>
            ) : isLoading ? (
              <button className="send-button" type="button" aria-label="Generating" disabled>
                <LoaderCircle size={22} />
              </button>
            ) : (
              <button className="voice-button" type="button" aria-label="Voice mode">
                <Volume2 size={24} fill="currentColor" />
              </button>
            )}
          </form>

          {messages.length === 0 && (
            <div className="quick-actions">
              {actionChips.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    className="action-chip"
                    key={action.label}
                    type="button"
                    onClick={() => setPrompt(action.label)}
                  >
                    <Icon size={21} />
                    <span>{action.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
