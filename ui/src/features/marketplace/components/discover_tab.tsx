import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, EyeOff, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { errorText, fmtPer1M, fmtTokens, marketApi, type AdminProvider, type DiscoverItem } from "@/features/marketplace/api/market_api";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

type Draft = { modelId: string; inputPerM: string; outputPerM: string };

// Models your providers offer that you don't sell yet (found by the nightly
// sync or "Sync now"): add one in a click, or ignore it.
export const DiscoverTab = ({ providers, onChange }: { providers: AdminProvider[]; onChange: () => void }) => {
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const load = () => marketApi.discover().then((r) => setItems(r.items)).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  const keyOf = (i: DiscoverItem) => `${i.providerId}|${i.upstreamModel}`;
  const draftOf = (i: DiscoverItem): Draft => drafts[keyOf(i)] ?? {
    modelId: i.suggestedModelId,
    inputPerM: i.inputPerM === null ? "" : String(i.inputPerM),
    outputPerM: i.outputPerM === null ? "" : String(i.outputPerM),
  };
  const setDraft = (i: DiscoverItem, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [keyOf(i)]: { ...draftOf(i), ...patch } }));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, DiscoverItem[]>();
    for (const i of items ?? []) {
      if (added.has(keyOf(i))) continue;
      if (q && !`${i.upstreamModel} ${i.suggestedModelId}`.toLowerCase().includes(q)) continue;
      map.set(i.providerId, [...(map.get(i.providerId) ?? []), i]);
    }
    return map;
  }, [items, query, added]);

  const syncNow = async (providerId?: string) => {
    setBusy(providerId ?? "all");
    setError(null);
    setNotice(null);
    try {
      const r = await marketApi.syncProviders(providerId);
      const failed = r.results.filter((x) => x.error);
      const found = r.results.reduce((n, x) => n + (x.added ?? x.fresh ?? 0), 0);
      setNotice(`Synced — ${found} new model${found === 1 ? "" : "s"} found${failed.length ? `; ${failed.length} provider${failed.length === 1 ? "" : "s"} failed (see below)` : ""}.`);
      await load();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const add = async (i: DiscoverItem) => {
    const d = draftOf(i);
    setBusy(keyOf(i));
    setError(null);
    try {
      const r = await marketApi.approveDiscovered({ providerId: i.providerId, upstreamModel: i.upstreamModel, modelId: d.modelId.trim(), inputPerM: d.inputPerM, outputPerM: d.outputPerM, contextLength: i.contextLength });
      setAdded((s) => new Set(s).add(keyOf(i)));
      setNotice(`Added ${i.upstreamModel} as ${r.modelId}.`);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const ignore = async (i: DiscoverItem) => {
    setBusy(keyOf(i));
    try {
      await marketApi.ignoreDiscovered(i.providerId, i.upstreamModel);
      setItems((list) => list?.filter((x) => keyOf(x) !== keyOf(i)) ?? null);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const ignoreAll = async (providerId: string) => {
    setBusy(`all:${providerId}`);
    try {
      await marketApi.ignoreAllDiscovered(providerId);
      setItems((list) => list?.filter((x) => x.providerId !== providerId) ?? null);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ag_section">
      <div className="mk_api_head">
        <h2 className="mk_h2">New from your providers</h2>
        <Button variant="primary" onClick={() => void syncNow()} busy={busy === "all"} disabled={!providers.length}><RefreshCw size={14} /> Sync now</Button>
      </div>
      <p className="ag_muted ag_small">Every night Owl checks what each provider offers. New chat models show up here — add them to the marketplace with your price, or ignore them.</p>
      <ErrorNote message={error} />
      {notice && <div className="mk_notice">{notice}</div>}

      <div className="mk_sync_list">
        {providers.filter((p) => p.enabled).map((p) => (
          <div key={p.id} className={`mk_sync ${p.syncError ? "is_bad" : ""}`}>
            <strong>{p.name}</strong>
            <span className="ag_muted ag_small">synced {ago(p.lastSyncedAt)}</span>
            {p.syncError && <span className="ag_small mk_bad"><CircleAlert size={12} /> {p.syncError}</span>}
            <button type="button" className="mk_icon_btn" onClick={() => void syncNow(p.id)} disabled={!!busy} title={`Sync ${p.name}`} aria-label={`Sync ${p.name}`}>
              {busy === p.id ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            </button>
          </div>
        ))}
      </div>

      {items && items.length > 8 && (
        <label className="mk_search mk_search--sm">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter models…" aria-label="Filter discovered models" />
        </label>
      )}

      {!items ? (
        <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : groups.size === 0 ? (
        <p className="ag_muted">{items.length ? "Nothing matches." : "Nothing new. Click Sync now to check your providers."}</p>
      ) : (
        [...groups.entries()].map(([providerId, list]) => (
          <div key={providerId} className="mk_disc_group">
            <div className="mk_api_head">
              <h3 className="mk_h3 mk_h3--flat">{list[0].providerName} <span className="ag_muted">· {list.length} new</span></h3>
              <Button variant="ghost" onClick={() => void ignoreAll(providerId)} busy={busy === `all:${providerId}`}><EyeOff size={14} /> Ignore all</Button>
            </div>
            <div className="mk_table_wrap">
              <table className="mk_table">
                <thead><tr><th>Provider's model</th><th className="is_num">Context</th><th>Sell as (model id)</th><th className="is_num">Your cost in /1M</th><th className="is_num">out /1M</th><th /></tr></thead>
                <tbody>
                  {list.slice(0, 200).map((i) => {
                    const d = draftOf(i);
                    const k = keyOf(i);
                    return (
                      <tr key={k}>
                        <td><code className="mk_mono">{i.upstreamModel}</code>{i.inputPerM !== null && <div className="ag_muted ag_small">listed at {fmtPer1M(i.inputPerM)} / {fmtPer1M(i.outputPerM ?? 0)}</div>}</td>
                        <td className="is_num">{fmtTokens(i.contextLength)}</td>
                        <td>
                          <input className="ag_input mk_mono mk_cell_input" value={d.modelId} onChange={(e) => setDraft(i, { modelId: e.target.value })} aria-label="Marketplace model id" />
                          {i.existingModel && d.modelId === i.suggestedModelId && <div className="ag_small mk_pos">Adds this provider to your existing model</div>}
                        </td>
                        <td className="is_num"><input className="ag_input mk_cell_input mk_cell_input--num" inputMode="decimal" value={d.inputPerM} placeholder="0.00" onChange={(e) => setDraft(i, { inputPerM: e.target.value.replace(/[^\d.]/g, "") })} aria-label="Input price" /></td>
                        <td className="is_num"><input className="ag_input mk_cell_input mk_cell_input--num" inputMode="decimal" value={d.outputPerM} placeholder="0.00" onChange={(e) => setDraft(i, { outputPerM: e.target.value.replace(/[^\d.]/g, "") })} aria-label="Output price" /></td>
                        <td className="mk_nowrap">
                          <Button onClick={() => void add(i)} busy={busy === k} disabled={!d.modelId.trim() || d.inputPerM === "" || d.outputPerM === ""}>{busy === k ? null : <Plus size={14} />} Add</Button>
                          <button type="button" className="mk_icon_btn" onClick={() => void ignore(i)} title="Ignore" aria-label={`Ignore ${i.upstreamModel}`} disabled={busy === k}><EyeOff size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > 200 && <p className="ag_muted ag_small">Showing 200 of {list.length} — use the filter to find others.</p>}
          </div>
        ))
      )}
      {added.size > 0 && <p className="ag_small mk_pos"><Check size={13} /> {added.size} added this session — see the Models tab.</p>}
    </section>
  );
};
