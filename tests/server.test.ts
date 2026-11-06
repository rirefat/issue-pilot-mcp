import { describe, it, expect, vi } from 'vitest';
import EventEmitter from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { app, createMcpServer } from '../src/index.js';
import * as tools from '../src/tools.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function dispatchRequest(
  method: string,
  url: string,
  payload?: Record<string, unknown>
): Promise<MockResponse> {
  return new Promise((resolve) => {
    const req = new EventEmitter() as EventEmitter & {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: unknown;
    };
    req.method = method;
    req.url = url;
    req.headers = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    req.body = payload;

    let statusCode = 200;
    const headers: Record<string, string> = {};
    let rawBody = '';

    const res = new EventEmitter() as EventEmitter & {
      status: (code: number) => typeof res;
      setHeader: (k: string, v: string) => typeof res;
      getHeader: (k: string) => string | undefined;
      json: (data: unknown) => typeof res;
      end: (chunk?: unknown) => typeof res;
    };

    res.status = (code: number) => {
      statusCode = code;
      return res;
    };
    res.setHeader = (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
      return res;
    };
    res.getHeader = (k: string) => headers[k.toLowerCase()];
    res.json = (data: unknown) => {
      resolve({ statusCode, body: data, headers });
      return res;
    };
    res.end = (chunk?: unknown) => {
      if (chunk) {
        rawBody += typeof chunk === 'string' ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
      }
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        resolve({ statusCode, body: parsed, headers });
      } catch {
        resolve({ statusCode, body: rawBody, headers });
      }
      return res;
    };

    app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
  });
}

describe('Express HTTP Endpoints', () => {
  it('GET /health returns 200 with status healthy and uptime', async () => {
    const res = await dispatchRequest('GET', '/health');
    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; uptime: number; timestamp: string };
    expect(body.status).toBe('healthy');
    expect(typeof body.uptime).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /non-existent returns 404 with JSON error format', async () => {
    const res = await dispatchRequest('GET', '/non-existent');
    expect(res.statusCode).toBe(404);
    const body = res.body as { error: string };
    expect(body.error).toBe('Endpoint not found');
  });
});

describe('MCP Server In-Memory Integration', () => {
  it('registers all 7 tools and serves tools/list', async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const listRes = await client.listTools();
    const toolNames = listRes.tools.map((t) => t.name);

    expect(toolNames).toHaveLength(7);
    expect(toolNames).toContain('hello');
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('list_issues');
    expect(toolNames).toContain('triage_issue');
    expect(toolNames).toContain('weekly_digest');
    expect(toolNames).toContain('release_notes');
    expect(toolNames).toContain('add_comment');

    await client.close();
    await server.close();
  });

  it('executes hello tool with structuredContent and content text', async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const res = await client.callTool({
      name: 'hello',
      arguments: { name: 'Issue Pilot' },
    });

    const structured = res.structuredContent as { message: string };
    expect(structured.message).toBe('Hello, Issue Pilot! Welcome to MCP.');

    const contentItem = (res.content as Array<{ type: string; text: string }>)[0];
    expect(contentItem.text).toContain('Hello, Issue Pilot!');

    await client.close();
    await server.close();
  });

  it('executes echo tool with text and ISO timestamp', async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const res = await client.callTool({
      name: 'echo',
      arguments: { text: 'mcp-optimization-test' },
    });

    const structured = res.structuredContent as { echo: string; timestamp: string };
    expect(structured.echo).toBe('mcp-optimization-test');
    expect(new Date(structured.timestamp).getTime()).not.toBeNaN();

    await client.close();
    await server.close();
  });

  it('handles tool execution errors gracefully with isError flag', async () => {
    vi.spyOn(tools, 'listIssues').mockRejectedValueOnce(
      new Error('GitHub API rate limit exceeded')
    );

    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const res = await client.callTool({
      name: 'list_issues',
      arguments: { owner: 'test-owner', repo: 'test-repo' },
    });

    expect(res.isError).toBe(true);
    const contentItem = (res.content as Array<{ type: string; text: string }>)[0];
    expect(contentItem.text).toBe('Failed to list issues: GitHub API rate limit exceeded');

    await client.close();
    await server.close();
  });
});
