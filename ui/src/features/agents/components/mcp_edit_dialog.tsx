import { useState } from "react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { McpServer } from "@/features/agents/types";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";

// Edit a connected MCP server: name, URL and token. A new URL or token
// reconnects and reloads its tools (keeping which ones were switched on).
export const McpEditDialog = ({ agentId, server, onSaved, onClose }: {
  agentId: string;
  server: McpServer;
  onSaved: (server: McpServer) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState(server.name);
  const [url, setUrl] = useState(server.url);
  const [token, setToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reconnects = url.trim() !== server.url || !!token.trim() || (removeToken && server.hasToken);
  const atlassian = url.includes("atlassian.com");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // token: omitted = keep, "" = remove, text = replace.
      const body: { name: string; url: string; token?: string } = { name: name.trim(), url: url.trim() };
      if (token.trim()) body.token = token.trim();
      else if (removeToken) body.token = "";
      onSaved(await agentsApi.updateMcp(agentId, server.id, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the server");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit ${server.name}`}
      subtitle="Change the server's name, address or access token."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} busy={busy} disabled={!name.trim() || !url.trim()}>{reconnects ? "Save and reconnect" : "Save"}</Button>
        </>
      }
    >
      <Field label="Name" hint="Shown to you and the model. Renaming changes the tools' names the agent sees.">
        <input className="ag_input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Server URL">
        <input className="ag_input ag_mono" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Access token" hint={server.hasToken
        ? "A token is saved (hidden). Leave this empty to keep it, or type a new one to replace it."
        : atlassian ? "Your Atlassian email, a colon, then the API token: you@company.com:ATATT…" : "Optional — sent as “Bearer <token>”."}>
        <input className="ag_input ag_mono" type="password" value={token} disabled={removeToken} autoComplete="new-password"
          placeholder={server.hasToken ? "•••••••• (unchanged)" : atlassian ? "you@company.com:ATATT…" : "ghp_…"} onChange={(e) => setToken(e.target.value)} />
      </Field>
      {server.hasToken && (
        <label className="ag_checkline">
          <input type="checkbox" checked={removeToken} onChange={(e) => { setRemoveToken(e.target.checked); if (e.target.checked) setToken(""); }} />
          Remove the saved token
        </label>
      )}
      {reconnects && <p className="ag_muted ag_small">Saving reconnects to the server and reloads its tools. Tools you had switched on stay on.</p>}
      <ErrorNote message={error} />
    </Modal>
  );
};
