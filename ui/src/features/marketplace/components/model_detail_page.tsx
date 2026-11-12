import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Brain, Check, Copy, Eye, KeyRound, LoaderCircle, MessageSquare, Plus, Wrench } from "lucide-react";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { apiBaseUrl, fmtLatency, fmtPer1M, fmtTokens, marketApi, MODELS_CHANGED, type MarketEndpoint, type MarketModel , errorText } from "@/features/marketplace/api/market_api";

type Tab = "curl" | "python" | "javascript";

const snippet = (tab: Tab, model: string) => {
  const base = apiBaseUrl();
  if (tab === "python") {
    return `from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="sk-owl-…")

reply = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(reply.choices[0].message.content)`;
  }
  if (tab === "javascript") {
    return `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}", apiKey: "sk-owl-…" });

const reply = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.choices[0].message.content);`;
  }
  return `curl ${base}/chat/completions \\
  -H "Authorization: Bearer sk-owl-…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`;
};

// One model: its providers (who serves it, at what price, context and
// uptime), how to call it from code, and adding it to the chat.
export const ModelDetailPage = () => {
  const { author = "", slug = "" } = useParams();
  const id = `${author}/${slug}`;
  const navigate = useNavigate();
  const [data, setData] = useState<{ model: MarketModel; endpoints: MarketEndpoint[] } | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([marketApi.model(id), marketApi.models()])
      .then(([d, all]) => { setData(d); setFavorite(all.favorites.includes(id)); })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  const toggleFavorite = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = favorite ? await marketApi.removeFavorite(id) : await marketApi.addFavorite(id);
      setFavorite(r.favorites.includes(id));
      window.dispatchEvent(new Event(MODELS_CHANGED));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const m = data?.model;
  return (
    <div className="ag_page mk_page">
      <Link to="/models" className="mk_back"><ArrowLeft size={15} /> All models</Link>
      <ErrorNote message={error} />
      {!m ? (
        !error && <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : (
        <>
          <header className="mk_detail__head">
            <span className="mk_avatar mk_avatar--lg" aria-hidden="true">{m.author.slice(0, 2).toUpperCase()}</span>
            <div className="mk_detail__titles">
              <h1 className="ag_page__title">{m.name}</h1>
              <button type="button" className="mk_id" onClick={() => void copy(m.id, "id")} title="Copy model id">
                <code>{m.id}</code> {copied === "id" ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <div className="mk_badges">
                {m.featured && <span className="mk_badge mk_badge--feat">Featured</span>}
                {m.indiaHosted && <span className="mk_badge">India-hosted</span>}
                {m.free && <span className="mk_badge mk_badge--free">Free</span>}
                {m.tools && <span className="mk_badge"><Wrench size={11} /> Tools</span>}
                {m.inputModalities.includes("image") && <span className="mk_badge"><Eye size={11} /> Vision</span>}
                {m.reasoning && <span className="mk_badge"><Brain size={11} /> Reasoning</span>}
                {m.structuredOutput && <span className="mk_badge">JSON output</span>}
              </div>
            </div>
            <div className="mk_detail__actions">
              <Button variant={favorite ? "secondary" : "primary"} onClick={() => void toggleFavorite()} busy={busy}>
                {favorite ? <><Check size={15} /> In chat</> : <><Plus size={15} /> Add to chat</>}
              </Button>
              {favorite && <Button variant="ghost" onClick={() => navigate("/chathome")}><MessageSquare size={15} /> Open chat</Button>}
            </div>
          </header>

          <div className="mk_stats">
            <div className="mk_stat"><span>Context</span><strong>{fmtTokens(m.contextLength)}</strong><em>tokens</em></div>
            <div className="mk_stat"><span>Max output</span><strong>{fmtTokens(m.maxOutput)}</strong><em>tokens</em></div>
            <div className="mk_stat"><span>Input</span><strong>{fmtPer1M(m.price.input)}</strong><em>per 1M tokens</em></div>
            <div className="mk_stat"><span>Output</span><strong>{fmtPer1M(m.price.output)}</strong><em>per 1M tokens</em></div>
            {m.created && <div className="mk_stat"><span>Released</span><strong>{new Date(m.created * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong><em>&nbsp;</em></div>}
          </div>

          {m.description && <p className="mk_desc">{m.description}</p>}

          <section className="ag_section">
            <h2 className="mk_h2">Providers</h2>
            <p className="ag_muted ag_small">Requests go to the best available provider automatically; if one fails, another takes over.</p>
            {data.endpoints.length ? (
              <div className="mk_table_wrap">
                <table className="mk_table">
                  <thead>
                    <tr><th>Provider</th><th className="is_num">Context</th><th className="is_num">Max output</th><th className="is_num">Input /1M</th><th className="is_num">Output /1M</th><th>Quantization</th><th>Tools</th><th className="is_num">Latency</th><th className="is_num">Uptime (24h)</th></tr>
                  </thead>
                  <tbody>
                    {data.endpoints.map((e, i) => (
                      <tr key={`${e.provider}-${i}`}>
                        <td><span className={`mk_dot mk_dot--${e.status}`} title={e.status} /> {e.provider}</td>
                        <td className="is_num">{fmtTokens(e.contextLength)}</td>
                        <td className="is_num">{fmtTokens(e.maxOutput)}</td>
                        <td className="is_num">{fmtPer1M(e.price.input)}</td>
                        <td className="is_num">{fmtPer1M(e.price.output)}</td>
                        <td>{e.quantization ?? "—"}</td>
                        <td>{e.tools ? <Check size={14} className="mk_yes" /> : <span className="ag_muted">—</span>}</td>
                        <td className="is_num">{fmtLatency(e.latencyMs)}</td>
                        <td className="is_num">{e.uptime1d === null ? "—" : `${e.uptime1d}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ag_muted">Provider details aren't available right now.</p>}
          </section>

          <section className="ag_section">
            <div className="mk_api_head">
              <h2 className="mk_h2">Use it from your code</h2>
              <Link to="/developer" className="mk_link"><KeyRound size={14} /> Get an API key</Link>
            </div>
            <p className="ag_muted ag_small">OpenAI-compatible — any OpenAI SDK works. Usage is charged to your credits.</p>
            <div className="mk_tabs" role="tablist">
              {(["curl", "python", "javascript"] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "is_on" : ""} onClick={() => setTab(t)}>
                  {t === "curl" ? "cURL" : t === "python" ? "Python" : "JavaScript"}
                </button>
              ))}
              <button type="button" className="mk_copy" onClick={() => void copy(snippet(tab, m.id), "code")}>{copied === "code" ? <Check size={14} /> : <Copy size={14} />} Copy</button>
            </div>
            <pre className="mk_code"><code>{snippet(tab, m.id)}</code></pre>
          </section>
        </>
      )}
    </div>
  );
};
