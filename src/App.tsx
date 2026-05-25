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
  ChevronDown,
  Circle,
  Compass,
  Image,
  LoaderCircle,
  Menu,
  MessageCircle,
  Mic,
  PenLine,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  SquarePen,
  Volume2,
} from 'lucide-react'

type ChatMessage = {
  id: string
  role: 'user' | 'model'
  text: string
  toolsUsed?: string[]
}

const modelName = 'gemini-2.5-flash'

const primaryItems = [
  { label: 'New chat', icon: SquarePen },
  { label: 'Search chats', icon: Search },
  { label: 'Pinned', icon: Pin },
  { label: 'Chats', icon: MessageCircle },
]

const actionChips = [
  { label: 'Create an image', icon: Image },
  { label: 'Write or edit', icon: PenLine },
  { label: 'Look something up', icon: Compass },
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

const toolByName = new Map<string, StructuredToolInterface>(
  agentTools.map((agentTool) => [agentTool.name, agentTool]),
)

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

async function runToolCall(toolCall: ToolCall) {
  const selectedTool = toolByName.get(toolCall.name)

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
  const agent = useMemo(() => {
    if (!apiKey) {
      return null
    }

    return new ChatGoogle({
      apiKey,
      model: modelName,
    }).bindTools(agentTools)
  }, [apiKey])

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
          'You are a helpful, concise AI agent. Use tools when they improve accuracy, especially for math, current date/time, web search, and Wikipedia background. After tools return, answer naturally and cite URLs from tool results when available.',
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
        const toolMessages = await Promise.all(toolCalls.map(runToolCall))
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

  function startNewChat() {
    setMessages([])
    setPrompt('')
    setError('')
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
      <aside className="sidebar" aria-label="Chat navigation">
        <div className="sidebar-top">
          <button className="brand-button" aria-label="Open AskAgent home">
            <img src="/askagent-logo.svg" alt="" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {primaryItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className="nav-item"
                key={item.label}
                type="button"
                aria-label={item.label}
                title={item.label}
                onClick={item.label === 'New chat' ? startNewChat : undefined}
              >
                <Icon size={21} />
              </button>
            )
          })}
        </nav>

        <div className="account">
          <div className="avatar">MP</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <button className="model-button" type="button">
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
