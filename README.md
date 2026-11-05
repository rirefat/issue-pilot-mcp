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

Set the environment variables in `.env` (see `.env.example`):

```bash
PORT=8080
NODE_ENV=development
GITHUB_TOKEN=your_github_personal_access_token_here
```

## Tools

- **hello** — Returns a greeting message
- **echo** — Echoes back the input text with an ISO timestamp
- **list_issues** — Fetch issues from a GitHub repository (filters out PRs)
- **triage_issue** — Automatically label an issue as `bug` or `enhancement` based on content
- **weekly_digest** — Summary of repository issue and PR updates over the last 7 days
- **release_notes** — Generate markdown release notes from recently merged pull requests
- **add_comment** — Post a comment on a GitHub issue or pull request

## Development

```bash
npm run dev          # Development mode with hot reload (tsx)
npm run build        # Compile TypeScript to JavaScript (tsc)
npm test             # Run unit tests (vitest)
npm run test:smoke   # Run smoke test against running server
npm start            # Run compiled server
```

## Testing

```bash
npm test                             # Run unit tests
npx @modelcontextprotocol/inspector  # Interactive MCP testing
```

Connect to `http://localhost:8080/mcp` to test tools interactively.

## Deployment

Deploy using MCPize CLI:

```bash
mcpize deploy
```

## License

MIT
