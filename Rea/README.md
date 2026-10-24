# Rea

Workspace for [REA](https://github.com/morluto/rea) (`rea-agents`), a reverse-engineering CLI and MCP server.

## Setup

```bash
cd Rea
npx rea-agents setup
```

`rea setup` configures detected agents (e.g. Claude Code) in your home directory and installs the
`reverse-engineer-anything` skill. Non-interactive variant:

```bash
npx rea-agents setup --yes --client claude_code
```

`.mcp.json` in this folder registers the `rea` MCP server (`rea mcp`) for Claude Code sessions
started from `Rea/`. It needs the CLI installed globally:

```bash
npm install -g rea-agents@6.7.0
```
