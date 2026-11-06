# issue-pilot-mcp

[![MCPize](https://mcpize.com/badge/@mcpize/mcpize?type=hosted)](https://mcpize.com)

Issue Pilot MCP server — manage and automate GitHub issues and pull requests via the Model Context Protocol (MCP).

## Quick Start

```bash
npm install
npm run dev     # Start with hot reload
```

Server runs at `http://localhost:8080/mcp` (Health check at `http://localhost:8080/health`).

## Configuration

Set environment variables in `.env` (see `.env.example`):

```bash
PORT=8080
NODE_ENV=development
GITHUB_TOKEN=your_github_personal_access_token_here
```

## Tools

- **hello** — Returns a greeting message
- **echo** — Echoes back the input text with an ISO timestamp
- **list_issues** — Fetch issues from a GitHub repository (filters out PRs)
- **triage_issue** — Automatically label an issue as `bug` or `enhancement` (avoids redundant label API calls if already present)
- **weekly_digest** — Summary of repository activity over the last 7 days (optimized per-page fetching)
- **release_notes** — Generate markdown release notes from recently merged pull requests (sorted by updated date)
- **add_comment** — Post a comment on a GitHub issue or pull request (auto-trimmed body)

## Development & Optimization

```bash
npm run dev          # Development mode with hot reload (tsx)
npm run typecheck    # Validate TypeScript types without emitting
npm run build        # Clean dist and compile TypeScript to JavaScript (tsc)
npm test             # Run unit and integration tests (vitest)
npm run test:smoke   # Run smoke test against running server (verifies health, init, tools/list, tools/call)
npm start            # Run compiled production server
```

### Key Optimizations

- **Cached Octokit Client**: Octokit instances are cached per authentication token, preventing heavy connection and plugin allocations on each tool call.
- **Zero-Overhead Production Logging**: Development response interception and JSON parsing are bypassed when `NODE_ENV=production`.
- **Streamable HTTP Conformance**: `/mcp` supports POST, GET, and DELETE requests according to the MCP specification.
- **Express Hardening**: `x-powered-by` disabled, 1MB JSON body payload limit, and JSON-formatted 404/500 error handlers.
- **Graceful Lifecycle Management**: Clean HTTP server shutdown on both `SIGTERM` and `SIGINT`.
- **Production Container Build**: Multi-stage Dockerfile running as non-root user `node`, with `NODE_ENV=production` and trimmed image layers.

## Deployment

Deploy using MCPize CLI:

```bash
mcpize deploy
```

## License

MIT
