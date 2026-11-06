# MCP Server Development Guide

This is an MCP (Model Context Protocol) server template for the MCPize hosting platform.

## Project Structure

```
├── src/
│   ├── index.ts      # Main server entry point (Express & MCP Streamable HTTP transport)
│   └── tools.ts      # Pure tool functions (testable, business logic only)
├── tests/
│   ├── tools.test.ts # Unit tests for pure tool functions
│   └── server.test.ts# Integration tests for Express & MCP endpoints
├── scripts/
│   ├── smoke-test.js # End-to-end smoke test script
│   └── post-init.js  # Template initialization script
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── mcpize.yaml       # MCPize deployment manifest
└── Dockerfile        # Container build instructions
```

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Run in development mode with hot reload (tsx)
npm run typecheck    # Type-check without building
npm test             # Run unit & integration tests with Vitest
npm run build        # Clean dist and compile TypeScript
npm run test:smoke   # Run smoke test against active server
npm start            # Run compiled server
```

## Architecture & Best Practices

1. **Pure Tools Separation**: Business logic lives in `src/tools.ts` with no MCP SDK dependencies, allowing fast, isolated unit testing.
2. **Client Caching**: `getOctokit()` caches client instances to minimize API setup overhead.
3. **Stateless HTTP Transport**: Uses `StreamableHTTPServerTransport` with fresh server instances per request as required by MCP stateless specification.
4. **Structured Output**: MCP tools return both human-readable `content` text and machine-readable `structuredContent`.
5. **Production Readiness**: Dev logging is disabled in production to eliminate body buffering and JSON parsing latency.
