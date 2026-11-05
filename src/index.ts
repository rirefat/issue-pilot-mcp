import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express, { Request, Response } from 'express'
import { z } from 'zod'
import chalk from 'chalk'
import {
  hello,
  echo,
  listIssues,
  triageIssue,
  weeklyDigest,
  releaseNotes,
  addComment
} from './tools.js'

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== 'production'

function timestamp (): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function formatLatency (ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`)
  if (ms < 500) return chalk.yellow(`${ms}ms`)
  return chalk.red(`${ms}ms`)
}

function truncate (str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

function logRequest (method: string, params?: unknown): void {
  if (!isDev) return

  const paramsStr = params
    ? chalk.gray(` ${truncate(JSON.stringify(params))}`)
    : ''
  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan('→')} ${method}${paramsStr}`
  )
}

function logResponse (method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return

  const latency = formatLatency(latencyMs)

  if (method === 'tools/call' && result) {
    const resultStr =
      typeof result === 'string' ? result : JSON.stringify(result)
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green('←')} ${truncate(
        resultStr
      )} ${chalk.gray(`(${latency})`)}`
    )
  } else {
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green(
        '✓'
      )} ${method} ${chalk.gray(`(${latency})`)}`
    )
  }
}

function logError (method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs)

  let errorMsg: string
  if (error instanceof Error) {
    errorMsg = error.message
  } else if (typeof error === 'object' && error !== null) {
    const rpcError = error as { message?: string; code?: number }
    errorMsg = rpcError.message || `Error ${rpcError.code || 'unknown'}`
  } else {
    errorMsg = String(error)
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red('✖')} ${method} ${chalk.red(
      truncate(errorMsg)
    )} ${chalk.gray(`(${latency})`)}`
  )
}

// ============================================================================
// MCP Server Setup
// ============================================================================

export function createMcpServer (): McpServer {
  const server = new McpServer({
    name: 'issue-pilot-mcp',
    version: '1.0.0'
  })

  // 1. Hello Tool
  server.registerTool(
    'hello',
    {
      title: 'Hello Tool',
      description: 'Returns a greeting message',
      inputSchema: {
        name: z.string().describe('Name to greet')
      },
      outputSchema: {
        message: z.string().describe('Greeting message')
      }
    },
    async ({ name }) => {
      const output = hello(name)
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  // 2. Echo Tool
  server.registerTool(
    'echo',
    {
      title: 'Echo Tool',
      description: 'Echoes back the input text with a timestamp',
      inputSchema: {
        text: z.string().describe('Text to echo')
      },
      outputSchema: {
        echo: z.string().describe('Echoed text'),
        timestamp: z.string().describe('ISO timestamp')
      }
    },
    async ({ text }) => {
      const output = echo(text)
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  // 3. List Issues Tool
  server.registerTool(
    'list_issues',
    {
      title: 'List Issues',
      description: 'Fetch a list of issues from a GitHub repository',
      inputSchema: {
        owner: z.string().describe('GitHub repository owner or organization'),
        repo: z.string().describe('GitHub repository name'),
        state: z
          .enum(['open', 'closed', 'all'])
          .default('open')
          .describe('Status of issues to fetch'),
        per_page: z
          .number()
          .int()
          .positive()
          .optional()
          .default(10)
          .describe('Number of issues to return (default: 10)')
      },
      outputSchema: {
        issues: z.string().describe('Formatted list of issues'),
        count: z.number().describe('Number of issues returned')
      }
    },
    async ({ owner, repo, state, per_page }) => {
      try {
        const output = await listIssues({ owner, repo, state, per_page })
        return {
          content: [{ type: 'text', text: output.issues }],
          structuredContent: output
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list issues: ${message}` }]
        }
      }
    }
  )

  // 4. Issue Triage Tool
  server.registerTool(
    'triage_issue',
    {
      title: 'Triage Issue',
      description: "Automatically label an issue as 'bug' or 'enhancement'",
      inputSchema: {
        owner: z.string().describe('GitHub repository owner or organization'),
        repo: z.string().describe('GitHub repository name'),
        issue_number: z
          .number()
          .int()
          .positive()
          .describe('The issue number to triage')
      },
      outputSchema: {
        message: z.string().describe('Status message describing triage outcome'),
        label: z.string().describe('The assigned label'),
        issue_number: z.number().describe('The issue number')
      }
    },
    async ({ owner, repo, issue_number }) => {
      try {
        const output = await triageIssue({ owner, repo, issue_number })
        return {
          content: [{ type: 'text', text: output.message }],
          structuredContent: output
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to triage issue: ${message}` }]
        }
      }
    }
  )

  // 5. Weekly Digest Tool
  server.registerTool(
    'weekly_digest',
    {
      title: 'Weekly Digest',
      description: 'Get a summary of repository activity from the last 7 days',
      inputSchema: {
        owner: z.string().describe('GitHub repository owner or organization'),
        repo: z.string().describe('GitHub repository name'),
        days: z
          .number()
          .int()
          .positive()
          .optional()
          .default(7)
          .describe('Number of past days to summarize (default: 7)')
      },
      outputSchema: {
        count: z.number().describe('Total number of issues/PRs updated'),
        summary: z.string().describe('Activity summary text'),
        since: z.string().describe('ISO timestamp for start of digest window')
      }
    },
    async ({ owner, repo, days }) => {
      try {
        const output = await weeklyDigest({ owner, repo, days })
        return {
          content: [{ type: 'text', text: output.summary }],
          structuredContent: output
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to generate weekly digest: ${message}` }
          ]
        }
      }
    }
  )

  // 6. Release Notes Generator Tool
  server.registerTool(
    'release_notes',
    {
      title: 'Release Notes Generator',
      description:
        'Generate markdown release notes from recently merged pull requests',
      inputSchema: {
        owner: z.string().describe('GitHub repository owner or organization'),
        repo: z.string().describe('GitHub repository name'),
        per_page: z
          .number()
          .int()
          .positive()
          .optional()
          .default(10)
          .describe('Number of PRs to inspect (default: 10)')
      },
      outputSchema: {
        notes: z.string().describe('Formatted markdown release notes'),
        count: z.number().describe('Number of merged PRs included')
      }
    },
    async ({ owner, repo, per_page }) => {
      try {
        const output = await releaseNotes({ owner, repo, per_page })
        return {
          content: [
            {
              type: 'text',
              text: `## Proposed Release Notes\n${output.notes}`
            }
          ],
          structuredContent: output
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to generate release notes: ${message}` }
          ]
        }
      }
    }
  )

  // 7. Add Comment Tool
  server.registerTool(
    'add_comment',
    {
      title: 'Add Comment',
      description: 'Post a comment on a GitHub issue or pull request',
      inputSchema: {
        owner: z.string().describe('GitHub repository owner or organization'),
        repo: z.string().describe('GitHub repository name'),
        issue_number: z
          .number()
          .int()
          .positive()
          .describe('Issue or pull request number'),
        body: z.string().describe('The text content of the comment')
      },
      outputSchema: {
        status: z.string().describe('Status of the operation'),
        message: z.string().describe('Status message'),
        issue_number: z.number().describe('The issue number commented on')
      }
    },
    async ({ owner, repo, issue_number, body }) => {
      try {
        const output = await addComment({ owner, repo, issue_number, body })
        return {
          content: [{ type: 'text', text: output.message }],
          structuredContent: output
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to add comment: ${message}` }]
        }
      }
    }
  )

  return server
}

// ============================================================================
// Express App Setup
// ============================================================================

export const app = express()
app.use(express.json())

// Health check endpoint (required for Cloud Run)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' })
})

// MCP endpoint with dev logging
app.post('/mcp', async (req: Request, res: Response) => {
  const startTime = Date.now()
  const body = req.body

  // Extract method and params from JSON-RPC request
  const method = body?.method || 'unknown'
  const params = body?.params

  // Log incoming request
  if (method === 'tools/call') {
    const toolName = params?.name || 'unknown'
    const toolArgs = params?.arguments
    logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs)
  } else if (method !== 'notifications/initialized') {
    logRequest(method, params)
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })

  // Capture response body for logging
  let responseBody = ''
  const originalWrite = res.write.bind(res) as typeof res.write
  const originalEnd = res.end.bind(res) as typeof res.end

  res.write = function (
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
    callback?: (error: Error | null | undefined) => void
  ) {
    if (chunk) {
      responseBody +=
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk as ArrayBuffer).toString()
    }
    return originalWrite(
      chunk as string,
      encodingOrCallback as BufferEncoding,
      callback
    )
  }

  res.end = function (
    chunk?: unknown,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ) {
    if (chunk) {
      responseBody +=
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk as ArrayBuffer).toString()
    }

    // Log response
    if (method !== 'notifications/initialized') {
      const latency = Date.now() - startTime

      try {
        const rpcResponse = JSON.parse(responseBody) as {
          result?: unknown
          error?: unknown
        }

        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency)
        } else if (method === 'tools/call') {
          const content = (
            rpcResponse?.result as { content?: Array<{ text?: string }> }
          )?.content
          const resultText = content?.[0]?.text
          logResponse(method, resultText, latency)
        } else {
          logResponse(method, null, latency)
        }
      } catch {
        logResponse(method, null, latency)
      }
    }

    return originalEnd(
      chunk as string,
      encodingOrCallback as BufferEncoding,
      callback
    )
  }

  res.on('close', () => {
    transport.close()
  })

  // Fresh server instance per request (stateless streamable-HTTP)
  const server = createMcpServer()
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: 'Internal server error' })
})

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || '8080')
export const httpServer = app.listen(port, () => {
  console.log()
  console.log(
    chalk.bold('MCP Server running on'),
    chalk.cyan(`http://localhost:${port}`)
  )
  console.log(`  ${chalk.gray('Health:')} http://localhost:${port}/health`)
  console.log(`  ${chalk.gray('MCP:')}    http://localhost:${port}/mcp`)

  if (isDev) {
    console.log()
    console.log(chalk.gray('─'.repeat(50)))
    console.log()
  }
})

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  httpServer.close(() => {
    process.exit(0)
  })
})
