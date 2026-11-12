import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, KeyRound, LoaderCircle, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";
import { apiBaseUrl, fmtUsd, marketApi, type DevKey, type MarketConfig , errorText } from "@/features/marketplace/api/market_api";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never");

// Developer API: keys for calling every marketplace model from your own code
// through an OpenAI-compatible endpoint, charged to your credits.
export const DeveloperPage = () => {
  const [keys, setKeys] = useState<DevKey[] | null>(null);
  const [cfg, setCfg] = useState<MarketConfig | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [created, setCreated] = useState<(DevKey & { key: string }) | null>(null);
  const [deleting, setDeleting] = useState<DevKey | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([marketApi.keys(), marketApi.config(), marketApi.wallet()])
      .then(([k, c, w]) => { setKeys(k.keys); setCfg(c); setBalance(w.balanceUsd); })
      .catch((e) => setError(errorText(e)));
  }, []);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* blocked */ }
  };

  const create = async () => {
    setBusy("create");
    setError(null);
    try {
      const k = await marketApi.createKey({ name: name.trim() || "API key", limitUsd: limit ? Number(limit) : null });
      setKeys((list) => [k, ...(list ?? [])]);
      setCreated(k);
      setCreating(false);
      setName("");
      setLimit("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (k: DevKey, enabled: boolean) => {
    setBusy(k.id);
    try {
      const u = await marketApi.updateKey(k.id, { disabled: !enabled });
      setKeys((list) => list?.map((x) => (x.id === k.id ? u : x)) ?? null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      await marketApi.deleteKey(deleting.id);
      setKeys((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
      setDeleting(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const base = apiBaseUrl();
  const curl = `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $OWL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "qwen/qwen3-32b", "messages": [{"role": "user", "content": "Hello!"}]}'`;

  return (
    <div className="ag_page mk_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Developer API</h1>
          <p className="ag_page__subtitle">One API key for every model in the <Link to="/models">marketplace</Link>. OpenAI-compatible, so any OpenAI SDK or tool works — just change the base URL.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Create key</Button>
      </header>
      <ErrorNote message={error} />
      {cfg && !cfg.enabled && <div className="mk_warn">The model marketplace isn't switched on for this server yet.</div>}
      {balance !== null && balance <= 0 && (
        <div className="mk_warn"><TriangleAlert size={15} /> Requests need credits — <Link to="/credits">add credits</Link> to start calling models.</div>
      )}

      <section className="ag_section">
        <div className="mk_api_head">
          <h2 className="mk_h2">Your keys</h2>
          {balance !== null && <span className="ag_muted ag_small">Balance: <Link to="/credits" className="mk_link">{fmtUsd(balance, 2)}</Link></span>}
        </div>
        {!keys ? (
          <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
        ) : keys.length ? (
          <div className="mk_table_wrap">
            <table className="mk_table">
              <thead><tr><th>Name</th><th>Key</th><th className="is_num">Used</th><th className="is_num">Limit</th><th>Last used</th><th>Enabled</th><th /></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={k.disabled ? "is_off" : ""}>
                    <td><KeyRound size={13} className="mk_keyicon" /> {k.name}</td>
                    <td><code className="mk_mono">{k.hint}</code></td>
                    <td className="is_num">{fmtUsd(k.usageUsd)}</td>
                    <td className="is_num">{k.limitUsd === null ? "No limit" : fmtUsd(k.limitUsd, 2)}</td>
                    <td>{fmtDate(k.lastUsedAt)}</td>
                    <td><Toggle checked={!k.disabled} onChange={(v) => void toggle(k, v)} label={`Enable ${k.name}`} disabled={busy === k.id} /></td>
                    <td><button type="button" className="mk_icon_btn" onClick={() => setDeleting(k)} title="Delete key" aria-label={`Delete ${k.name}`}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ag_muted">No keys yet. Create one to call models from your code.</p>}
      </section>

      <section className="ag_section">
        <h2 className="mk_h2">Quickstart</h2>
        <dl className="mk_kv">
          <div><dt>Base URL</dt><dd><code className="mk_mono">{base}</code> <button type="button" className="mk_icon_btn" onClick={() => void copy(base, "base")} aria-label="Copy base URL">{copied === "base" ? <Check size={14} /> : <Copy size={14} />}</button></dd></div>
          <div><dt>Chat</dt><dd><code className="mk_mono">POST /chat/completions</code> — streaming supported (<code>"stream": true</code>)</dd></div>
          <div><dt>Models</dt><dd><code className="mk_mono">GET /models</code> — ids like <code>qwen/qwen3-32b</code>, <code>anthropic/claude-sonnet-4.5</code></dd></div>
          <div><dt>Key info</dt><dd><code className="mk_mono">GET /key</code> · balance: <code className="mk_mono">GET /credits</code></dd></div>
          <div><dt>Limits</dt><dd>{cfg?.apiRequestsPerMinute ?? 60} requests per minute per key. Requests need a positive credit balance.</dd></div>
        </dl>
        <div className="mk_tabs"><span className="mk_tabs__label">cURL</span><button type="button" className="mk_copy" onClick={() => void copy(curl, "curl")}>{copied === "curl" ? <Check size={14} /> : <Copy size={14} />} Copy</button></div>
        <pre className="mk_code"><code>{curl}</code></pre>
      </section>

      {creating && (
        <Modal title="Create API key" onClose={() => setCreating(false)} footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void create()} busy={busy === "create"}>Create key</Button>
          </>
        }>
          <Field label="Name" hint="So you can tell your keys apart, e.g. the app that uses it.">
            <input className="ag_input" value={name} maxLength={60} placeholder="My app" onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Credit limit (optional)" hint="The key stops working once it has spent this much. Leave empty for no limit.">
            <input className="ag_input" inputMode="decimal" value={limit} placeholder="e.g. 10 (USD)" onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
        </Modal>
      )}

      {created && (
        <Modal title="Your new API key" subtitle="Copy it now — for your security it won't be shown again." onClose={() => setCreated(null)} footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}>
          <div className="mk_newkey">
            <code>{created.key}</code>
            <Button onClick={() => void copy(created.key, "key")}>{copied === "key" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</Button>
          </div>
          <p className="ag_muted ag_small">Keep it secret: anyone with this key can spend your credits. Store it in an environment variable, not in code.</p>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="Apps using this key stop working immediately. This can't be undone."
          confirmLabel="Delete key"
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
          busy={busy === deleting.id}
        />
      )}
    </div>
  );
};
