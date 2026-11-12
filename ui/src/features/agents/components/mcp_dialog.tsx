import { useState } from "react";
import { ArrowLeft, Plug } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { McpServer, McpTool } from "@/features/agents/types";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";

// Public servers that work without an account, for a one-click start.
const POPULAR = [
  { name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", hint: "Docs for any public GitHub repo" },
  { name: "Atlassian", url: "https://mcp.atlassian.com/v2/mcp", hint: "Jira & Confluence — token: your-email:api-token" },
];

// Two steps: connect (URL + optional token) → pick which tools the agent may use.
export const McpDialog = ({ agentId, onAdded, onClose }: {
  agentId: string;
  onAdded: (server: McpServer) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const found = await agentsApi.discoverMcp(url.trim(), token.trim() || undefined);
      setTools(found);
      setEnabled(new Set(found.map((t) => t.name)));
      if (!name.trim()) {
        try {
          setName(new URL(url).hostname.replace(/^(www|mcp)\./, "").split(".")[0].replace(/^./, (c) => c.toUpperCase()));
        } catch {
          // keep empty
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      onAdded(await agentsApi.addMcp(agentId, { name: name.trim(), url: url.trim(), token: token.trim() || undefined, enabledTools: [...enabled] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the server");
      setBusy(false);
    }
  };

  const toggle = (toolName: string) =>
    setEnabled((s) => {
      const next = new Set(s);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });

  return (
    <Modal
      wide
      title={tools ? `Choose tools from ${name || "this server"}` : "Connect an MCP server"}
      subtitle={tools ? "Only switched-on tools are available to the agent. Leave off anything that changes data unless you trust it." : "MCP servers give an agent ready-made tools — GitHub, Notion, databases and more."}
      onClose={onClose}
      footer={
        tools ? (
          <>
            <Button variant="ghost" onClick={() => setTools(null)}><ArrowLeft size={15} /> Back</Button>
            <Button variant="primary" onClick={add} busy={busy} disabled={!name.trim() || enabled.size === 0}>
              Add {enabled.size} tool{enabled.size === 1 ? "" : "s"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={connect} busy={busy} disabled={!url.trim()}><Plug size={15} /> Connect</Button>
          </>
        )
      }
    >
      {!tools && (
        <>
          <div className="ag_presets">
            {POPULAR.map((p) => (
              <button key={p.url} type="button" className={`ag_preset ${url === p.url ? "is_active" : ""}`} onClick={() => { setName(p.name); setUrl(p.url); setToken(""); }}>
                <strong>{p.name}</strong>
                <span>{p.hint}</span>
              </button>
            ))}
          </div>
          <Field label="Server URL" hint="The server's remote (HTTP) address — usually ends in /mcp or /sse.">
            <input className="ag_input ag_mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" autoFocus />
          </Field>
          <div className="ag_row ag_row--2">
            <Field label="Name" hint="Shown to you and the model">
              <input className="ag_input" value={name} onChange={(e) => setName(e.target.value)} placeholder="GitHub" />
            </Field>
            <Field label="Access token (optional)" hint={url.includes("atlassian.com")
              ? "Type your Atlassian email, a colon, then the API token: you@company.com:ATATT… (it's turned into the right header). Stored encrypted."
              : "Sent as “Bearer <token>”; “email:token” is sent as Basic auth; “Basic …” / “Bearer …” as typed. Stored encrypted."}>
              <input className="ag_input ag_mono" type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={url.includes("atlassian.com") ? "you@company.com:ATATT…" : "ghp_…"} />
            </Field>
          </div>
        </>
      )}

      {tools && (
        <>
          <div className="ag_tool_list_head">
            <span className="ag_muted ag_small">{tools.length} tool{tools.length === 1 ? "" : "s"} found</span>
            <div>
              <Button variant="ghost" onClick={() => setEnabled(new Set(tools.map((t) => t.name)))}>All</Button>
              <Button variant="ghost" onClick={() => setEnabled(new Set())}>None</Button>
            </div>
          </div>
          <div className="ag_tool_list">
            {tools.map((t) => (
              <label key={t.name} className={`ag_tool ${enabled.has(t.name) ? "is_on" : ""}`}>
                <input type="checkbox" checked={enabled.has(t.name)} onChange={() => toggle(t.name)} />
                <span>
                  <strong className="ag_mono">{t.name}</strong>
                  {t.description && <span className="ag_tool__desc">{t.description}</span>}
                </span>
              </label>
            ))}
          </div>
          <Field label="Name">
            <input className="ag_input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </>
      )}

      <ErrorNote message={error} />
    </Modal>
  );
};
