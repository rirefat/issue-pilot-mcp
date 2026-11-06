import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import { z } from 'zod';
import chalk from 'chalk';
import * as tools from './tools.js';

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== 'production';

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;
  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : '';
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan('→')} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;
  const latency = formatLatency(latencyMs);

  if (method === 'tools/call' && result) {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green('←')} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`
    );
  } else {
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green('✓')} ${method} ${chalk.gray(`(${latency})`)}`
    );
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);
  let errorMsg: string;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === 'object' && error !== null) {
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || 'unknown'}`;
  } else {
    errorMsg = String(error);
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red('✖')} ${method} ${chalk.red(
      truncate(errorMsg)
    )} ${chalk.gray(`(${latency})`)}`
  );
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

interface RegisterToolOptions<TIn, TOut extends Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  outputSchema: z.ZodRawShape;
  actionLabel: string;
  execute: (args: TIn) => Promise<TOut> | TOut;
  formatText: (output: TOut) => string;
}

function registerTool<TIn, TOut extends Record<string, unknown>>(
  server: McpServer,
  options: RegisterToolOptions<TIn, TOut>
): void {
  server.registerTool(
    options.name,
    {
      title: options.title,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
    },
    async (args) => {
      try {
        const output = await options.execute(args as TIn);
        return {
          content: [{ type: 'text' as const, text: options.formatText(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to ${options.actionLabel}: ${message}`,
            },
          ],
        };
      }
    }
  );
}

// ============================================================================
// MCP Server Setup
// ============================================================================

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'issue-pilot-mcp',
    version: '1.0.0',
  });

  // 1. Hello Tool
  registerTool(server, {
    name: 'hello',
    title: 'Hello Tool',
    description: 'Returns a greeting message',
    inputSchema: {
      name: z.string().describe('Name to greet'),
    },
    outputSchema: {
      message: z.string().describe('Greeting message'),
    },
    actionLabel: 'greet',
    execute: ({ name }: { name: string }) => tools.hello(name),
    formatText: (out) => JSON.stringify(out),
  });

  // 2. Echo Tool
  registerTool(server, {
    name: 'echo',
    title: 'Echo Tool',
    description: 'Echoes back the input text with a timestamp',
    inputSchema: {
      text: z.string().describe('Text to echo'),
    },
    outputSchema: {
      echo: z.string().describe('Echoed text'),
      timestamp: z.string().describe('ISO timestamp'),
    },
    actionLabel: 'echo',
    execute: ({ text }: { text: string }) => tools.echo(text),
    formatText: (out) => JSON.stringify(out),
  });

  // 3. List Issues Tool
  registerTool(server, {
    name: 'list_issues',
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
        .describe('Number of issues to return (default: 10)'),
    },
    outputSchema: {
      issues: z.string().describe('Formatted list of issues'),
      count: z.number().describe('Number of issues returned'),
    },
    actionLabel: 'list issues',
    execute: (args: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; per_page?: number }) =>
      tools.listIssues(args),
    formatText: (out) => out.issues,
  });

  // 4. Issue Triage Tool
  registerTool(server, {
    name: 'triage_issue',
    title: 'Triage Issue',
    description: "Automatically label an issue as 'bug' or 'enhancement'",
    inputSchema: {
      owner: z.string().describe('GitHub repository owner or organization'),
      repo: z.string().describe('GitHub repository name'),
      issue_number: z
        .number()
        .int()
        .positive()
        .describe('The issue number to triage'),
    },
    outputSchema: {
      message: z.string().describe('Status message describing triage outcome'),
      label: z.string().describe('The assigned label'),
      issue_number: z.number().describe('The issue number'),
    },
    actionLabel: 'triage issue',
    execute: (args: { owner: string; repo: string; issue_number: number }) =>
      tools.triageIssue(args),
    formatText: (out) => out.message,
  });

  // 5. Weekly Digest Tool
  registerTool(server, {
    name: 'weekly_digest',
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
        .describe('Number of past days to summarize (default: 7)'),
    },
    outputSchema: {
      count: z.number().describe('Total number of issues/PRs updated'),
      summary: z.string().describe('Activity summary text'),
      since: z.string().describe('ISO timestamp for start of digest window'),
    },
    actionLabel: 'generate weekly digest',
    execute: (args: { owner: string; repo: string; days?: number }) =>
      tools.weeklyDigest(args),
    formatText: (out) => out.summary,
  });

  // 6. Release Notes Generator Tool
  registerTool(server, {
    name: 'release_notes',
    title: 'Release Notes Generator',
    description: 'Generate markdown release notes from recently merged pull requests',
    inputSchema: {
      owner: z.string().describe('GitHub repository owner or organization'),
      repo: z.string().describe('GitHub repository name'),
      per_page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe('Number of PRs to inspect (default: 10)'),
    },
    outputSchema: {
      notes: z.string().describe('Formatted markdown release notes'),
      count: z.number().describe('Number of merged PRs included'),
    },
    actionLabel: 'generate release notes',
    execute: (args: { owner: string; repo: string; per_page?: number }) =>
      tools.releaseNotes(args),
    formatText: (out) => `## Proposed Release Notes\n${out.notes}`,
  });

  // 7. Add Comment Tool
  registerTool(server, {
    name: 'add_comment',
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
      body: z.string().describe('The text content of the comment'),
    },
    outputSchema: {
      status: z.string().describe('Status of the operation'),
      message: z.string().describe('Status message'),
      issue_number: z.number().describe('The issue number commented on'),
    },
    actionLabel: 'add comment',
    execute: (args: { owner: string; repo: string; issue_number: number; body: string }) =>
      tools.addComment(args),
    formatText: (out) => out.message,
  });

  return server;
}

// ============================================================================
// Express App Setup
// ============================================================================

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Health check endpoint (required for Cloud Run / container orchestrators)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// MCP endpoint supporting Streamable HTTP (POST, GET, DELETE)
app.all('/mcp', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body as { method?: string; params?: { name?: string; arguments?: unknown } } | undefined;
  const method = body?.method || req.method;

  // Log incoming request in development mode
  if (isDev) {
    if (method === 'tools/call') {
      const toolName = body?.params?.name || 'unknown';
      const toolArgs = body?.params?.arguments;
      logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs);
    } else if (method !== 'notifications/initialized') {
      logRequest(method, body?.params);
    }

    // Only hook write and end in development mode for zero-overhead production streaming
    let responseBody = '';
    const originalWrite = res.write.bind(res) as typeof res.write;
    const originalEnd = res.end.bind(res) as typeof res.end;

    res.write = function (
      chunk: unknown,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ) {
      if (chunk) {
        responseBody +=
          typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk as ArrayBuffer).toString();
      }
      return originalWrite(
        chunk as string,
        encodingOrCallback as BufferEncoding,
        callback
      );
    };

    res.end = function (
      chunk?: unknown,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void
    ) {
      if (chunk) {
        responseBody +=
          typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk as ArrayBuffer).toString();
      }

      if (method !== 'notifications/initialized') {
        const latency = Date.now() - startTime;
        try {
          const rpcResponse = JSON.parse(responseBody) as {
            result?: unknown;
            error?: unknown;
          };

          if (rpcResponse?.error) {
            logError(method, rpcResponse.error, latency);
          } else if (method === 'tools/call') {
            const content = (
              rpcResponse?.result as { content?: Array<{ text?: string }> }
            )?.content;
            const resultText = content?.[0]?.text;
            logResponse(method, resultText, latency);
          } else {
            logResponse(method, null, latency);
          }
        } catch {
          logResponse(method, null, latency);
        }
      }

      return originalEnd(
        chunk as string,
        encodingOrCallback as BufferEncoding,
        callback
      );
    };
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close();
  });

  // Fresh server instance per request (stateless streamable-HTTP)
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// JSON error handler (prevents default Express HTML error responses)
app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// Start Server
// ============================================================================

export let httpServer: Server | undefined;

export function startServer(port = parseInt(process.env.PORT || '8080', 10)): Server {
  const server = app.listen(port, () => {
    console.log();
    console.log(
      chalk.bold('MCP Server running on'),
      chalk.cyan(`http://localhost:${port}`)
    );
    console.log(`  ${chalk.gray('Health:')} http://localhost:${port}/health`);
    console.log(`  ${chalk.gray('MCP:')}    http://localhost:${port}/mcp`);

    if (isDev) {
      console.log();
      console.log(chalk.gray('─'.repeat(50)));
      console.log();
    }
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Start server automatically unless in test environment
if (process.env.NODE_ENV !== 'test') {
  httpServer = startServer();
}
