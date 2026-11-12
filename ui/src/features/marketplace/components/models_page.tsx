import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Check, Eye, LoaderCircle, Plus, Search, Wrench } from "lucide-react";
import { ErrorNote } from "@/shared/ui/ui";
import { errorText, fmtPer1M, fmtTokens, marketApi, MODELS_CHANGED, type MarketModel } from "@/features/marketplace/api/market_api";

const PAGE = 60;
type Sort = "newest" | "price" | "context" | "name";
type Filter = "free" | "tools" | "vision" | "reasoning" | "mine";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "tools", label: "Tool calling" },
  { id: "vision", label: "Vision" },
  { id: "reasoning", label: "Reasoning" },
  { id: "mine", label: "In my chat" },
];

// The model marketplace: every model available through OpenRouter, with what
// it costs here. Add models to the chat's model picker, or call them with a
// developer API key.
export const ModelsPage = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<MarketModel[] | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    marketApi.models().then((r) => { setModels(r.models); setFavorites(r.favorites); }).catch((e) => setError(errorText(e)));
  }, []);

  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models ?? []) counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [models]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (models ?? []).filter((m) => {
      if (author && m.author !== author) return false;
      if (q && !`${m.name} ${m.id} ${m.description}`.toLowerCase().includes(q)) return false;
      if (filters.has("free") && !m.free) return false;
      if (filters.has("tools") && !m.tools) return false;
      if (filters.has("vision") && !m.inputModalities.includes("image")) return false;
      if (filters.has("reasoning") && !m.reasoning) return false;
      if (filters.has("mine") && !favorites.includes(m.id)) return false;
      return true;
    });
    const price = (m: MarketModel) => m.price.input + m.price.output;
    if (sort === "price") list.sort((a, b) => price(a) - price(b));
    else if (sort === "context") list.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [models, query, author, filters, sort, favorites]);

  const toggleFilter = (f: Filter) => {
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
    setShown(PAGE);
  };

  const toggleFavorite = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const r = favorites.includes(id) ? await marketApi.removeFavorite(id) : await marketApi.addFavorite(id);
      setFavorites(r.favorites);
      window.dispatchEvent(new Event(MODELS_CHANGED));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ag_page mk_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Models</h1>
          <p className="ag_page__subtitle">
            {models ? `${models.length} models from ${authors.length} labs` : "Every major model"} — use them in chat with your credits, or from your own code with a developer API key.
          </p>
        </div>
      </header>
      <ErrorNote message={error} />

      <div className="mk_toolbar">
        <label className="mk_search">
          <Search size={16} />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search models (e.g. qwen, claude, llama)…" aria-label="Search models" />
        </label>
        <select className="ag_input mk_select" value={author} onChange={(e) => { setAuthor(e.target.value); setShown(PAGE); }} aria-label="Lab">
          <option value="">All labs</option>
          {authors.map(([a, n]) => <option key={a} value={a}>{a} ({n})</option>)}
        </select>
        <select className="ag_input mk_select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="price">Price: low to high</option>
          <option value="context">Context: largest</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="mk_chips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`mk_chip ${filters.has(f.id) ? "is_on" : ""}`} aria-pressed={filters.has(f.id)} onClick={() => toggleFilter(f.id)}>
            {filters.has(f.id) && <Check size={13} />}{f.label}
            {f.id === "mine" && favorites.length > 0 && <span className="mk_chip__n">{favorites.length}</span>}
          </button>
        ))}
        {models && <span className="mk_count">{visible.length} shown</span>}
      </div>

      {!models && !error ? (
        <div className="mk_list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="mk_row mk_row--skeleton" />)}</div>
      ) : (
        <ul className="mk_list">
          {visible.slice(0, shown).map((m) => {
            const fav = favorites.includes(m.id);
            return (
              <li key={m.id} className="mk_row">
                <button type="button" className="mk_row__main" onClick={() => navigate(`/models/${m.id}`)}>
                  <span className="mk_row__head">
                    <span className="mk_avatar" aria-hidden="true">{m.author.slice(0, 2).toUpperCase()}</span>
                    <span className="mk_row__titles">
                      <strong className="mk_row__name">{m.name}</strong>
                      <code className="mk_row__id">{m.id}</code>
                    </span>
                  </span>
                  <span className="mk_row__desc">{m.description || "No description."}</span>
                  <span className="mk_badges">
                    {m.featured && <span className="mk_badge mk_badge--feat">Featured</span>}
                    {m.indiaHosted && <span className="mk_badge">India-hosted</span>}
                    {m.free && <span className="mk_badge mk_badge--free">Free</span>}
                    {m.tools && <span className="mk_badge"><Wrench size={11} /> Tools</span>}
                    {m.inputModalities.includes("image") && <span className="mk_badge"><Eye size={11} /> Vision</span>}
                    {m.reasoning && <span className="mk_badge"><Brain size={11} /> Reasoning</span>}
                  </span>
                </button>
                <div className="mk_row__stats">
                  <div><span>Context</span><strong>{fmtTokens(m.contextLength)}</strong></div>
                  <div><span>Input /1M</span><strong>{fmtPer1M(m.price.input)}</strong></div>
                  <div><span>Output /1M</span><strong>{fmtPer1M(m.price.output)}</strong></div>
                </div>
                <button
                  type="button"
                  className={`mk_add ${fav ? "is_on" : ""}`}
                  onClick={() => void toggleFavorite(m.id)}
                  disabled={busy === m.id}
                  title={fav ? "Remove from the chat's model picker" : "Add to the chat's model picker"}
                >
                  {busy === m.id ? <LoaderCircle size={14} className="spin" /> : fav ? <Check size={14} /> : <Plus size={14} />}
                  {fav ? "In chat" : "Add to chat"}
                </button>
              </li>
            );
          })}
          {models && !visible.length && <li className="mk_empty">No models match these filters.</li>}
        </ul>
      )}
      {visible.length > shown && (
        <div className="mk_more"><button type="button" className="ag_btn ag_btn--secondary" onClick={() => setShown((n) => n + PAGE)}>Show more ({visible.length - shown} more)</button></div>
      )}
    </div>
  );
};
