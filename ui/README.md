# Owl Bot — web app

React + TypeScript + Vite frontend for Owl Bot: chat with ChatGPT or Claude,
search and explain documents in your knowledge base, and connect WhatsApp.

Backend: `../../node_prac/owlbot` (must be running).

## Run it

```bash
npm install
npm run dev               # http://localhost:5173
```

`.env` needs one variable:

| Variable | What |
|---|---|
| `VITE_API_URL` | Backend chat API, e.g. `http://localhost:3000/api` |

Firebase web settings live in `src/shared/lib/firebase.ts` (these are
public by design). Anything prefixed `VITE_` is bundled into the browser code,
so never put server secrets in this `.env`.

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | ESLint |

## Layout

```
src/
  main.tsx                 entry point (imports styles/index.css — the only CSS import)
  app/                     routes (App.tsx), page frame (app_shell.tsx), Redux store
  shared/                  used by several features: api/, lib/ (Firebase), ui/ (UI kit), types
  styles/                  index.css (cascade order), tokens, base, layout, themes/
  features/                auth, chat, whatsapp, agents, pipelines, native_agents,
                           storage, insights, billing — each with api/, components/,
                           state/, styles/ as needed
docs/                      architecture, deployment notes, sample data
```

Where code and styles go, and the CSS conventions: [docs/frontend-architecture.md](docs/frontend-architecture.md).
