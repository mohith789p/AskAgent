/// <reference types="vite/client" />

type AskAgentDesktopToolResult = {
  ok: boolean
  [key: string]: unknown
}

interface Window {
  askAgentDesktop?: {
    platform: string
    invokeTool: (name: string, input: Record<string, unknown>) => Promise<AskAgentDesktopToolResult>
  }
}
