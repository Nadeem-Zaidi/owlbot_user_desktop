# Owl — desktop edition

Owl's agents and workflows as a desktop app for organisations that won't use
model API keys or a hosted server. Everything runs on the employee's computer:

- **Answers come from Claude Code**, signed in with the person's own Claude
  account (the organisation's Claude plan). No API key is read or sent.
- **All data stays in one SQLite file** on the computer
  (`%APPDATA%\Owl\data\owl.db`). There is no Owl server.
- **Same UI as the web app**, minus what needs a server (billing, team
  workspaces, WhatsApp/Telegram, reminders).

Prompts still go to Anthropic to be answered, under the organisation's plan;
"offline" here means no Owl server and no third-party keys.

## Requirements on each computer

1. Claude Code signed in once: open a terminal, run `claude`, sign in with the
   organisation's Claude account. (Claude Code itself ships inside the app.)
2. Windows x64.

## Develop

```bash
npm install
npm --prefix ui install
npm run build        # engine (TypeScript) + UI (Vite)
npm start            # opens the app
npm test             # 53 tests: agents, helpers, workflows, Studio, SQLite
npm run engine       # engine only; prints an address + token for a browser
```

If you start the app from inside a Claude Code session, unset
`ELECTRON_RUN_AS_NODE` first.

## Package

```bash
npm run dist         # release/Owl Setup <version>.exe
```

Claude Code (`claude.exe`, ~330 MB) is unpacked next to the app archive
(`asarUnpack` in `electron-builder.yml`) because a program can't start from
inside it. The unpacked app (`release/win-unpacked`) is about 716 MB, most of
it Electron and Claude Code.

## How it's built

| Part | Where |
|---|---|
| Electron shell: starts the engine, opens the window, hands it a per-launch token | `src/main/` |
| Engine: Express on `127.0.0.1` only, refuses any request without the token | `src/engine/app.ts`, `src/engine/http/` |
| Claude Code provider: runs each turn, offers the agent's tools over an in-process MCP server, streams the web app's event format | `src/engine/llms/claude_code_provider.ts` |
| SQLite adapter: lets the server's Postgres repositories run unchanged | `src/engine/db/sqlite_adapter.ts` |
| Schema: generated from the server's 33 migrations | `src/engine/db/schema.ts`, `schema_types.ts` |
| Agents, workflows, Studio, schedules: the server edition's code | `src/engine/service/`, `src/engine/core/`, `src/engine/repository/` |
| UI: the web app, with a local stand-in for Firebase sign-in | `ui/` (`ui/src/shared/lib/firebase.ts`, `ui/src/shared/lib/features.ts`) |

Claude Code gets none of its own tools (no shell, no file access): only the
agent's tools from Owl. Read-only tools are marked so it can run several at
once (helper agents in parallel).

Agents' HTTP functions and MCP servers may call private (company) addresses;
set `AGENT_ALLOW_PRIVATE_URLS=false` to block them as the server does.

## Not built yet

- Knowledge base (indexing with OpenAI embeddings into SQLite) — hidden.
- Word & Excel files from Claude Code — needs a decision on how files are made.
- Skills, reminders & watchers, code functions (Python), email delivery.
- Schedules run only while the app is open.
