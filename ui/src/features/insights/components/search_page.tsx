import { useCallback, useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { LoaderCircle, MessageSquare, Search, X } from "lucide-react";
import { insightsApi, type SearchResult } from "@/features/insights/api/insights_api";
import type { Session } from "@/shared/types";

const relative = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// Wraps every case-insensitive occurrence of `query` in <mark>.
const Highlight = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((p, i) => (p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
};

const SourceBadge = ({ r }: { r: Pick<SearchResult, "source" | "agent_icon" | "agent_name"> }) => (
  <>
    {r.agent_icon && <span className="srch_badge" title={r.agent_name ?? "Agent"}><AgentAvatar icon={r.agent_icon} /> {r.agent_name}</span>}
    {r.source === "whatsapp" && <span className="srch_badge srch_badge--wa"><FontAwesomeIcon icon={faWhatsapp} /> WhatsApp</span>}
  </>
);

// Calls onVisible when the element scrolls into view (a little early, so the
// next page is usually there before the user reaches the end).
function useInfiniteScroll(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onVisible);
  useEffect(() => { latest.current = onVisible; });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) latest.current(); }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// Shimmer rows while a page loads.
const SkeletonRows = ({ count }: { count: number }) => (
  <ul className="srch_results srch_skeleton" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <li key={i} className="srch_skeleton_row">
        <span className="srch_skeleton_bar" style={{ width: `${[48, 62, 40, 55, 35][i % 5]}%` }} />
        <span className="srch_skeleton_bar srch_skeleton_bar--time" />
      </li>
    ))}
  </ul>
);

export const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // "All chats": every chat, fetched 30 at a time as the user scrolls.
  const [chats, setChats] = useState<Session[]>([]);
  const [chatsCursor, setChatsCursor] = useState<string | null>(null);
  const [chatsDone, setChatsDone] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const chatsBusy = useRef(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  useEffect(() => inputRef.current?.focus(), []);

  // Search 300 ms after the user stops typing; ignore stale responses.
  useEffect(() => {
    if (trimmed.length < 2) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await insightsApi.searchChats(trimmed);
        if (seq === searchSeq.current) { setResults(r.results); setNextOffset(r.nextOffset); setActive(0); }
      } catch (e) {
        if (seq === searchSeq.current) setError(errorText(e, "Search failed"));
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); };
  }, [trimmed]);

  const loadMoreResults = async () => {
    if (loading || loadingMore || nextOffset === null || trimmed.length < 2) return;
    const seq = searchSeq.current;
    setLoadingMore(true);
    try {
      const r = await insightsApi.searchChats(trimmed, nextOffset);
      if (seq !== searchSeq.current) return; // the query changed meanwhile
      setResults((prev) => {
        const seen = new Set((prev ?? []).map((x) => x.session_id));
        return [...(prev ?? []), ...r.results.filter((x) => !seen.has(x.session_id))];
      });
      setNextOffset(r.nextOffset);
    } catch (e) {
      if (seq === searchSeq.current) setError(errorText(e, "Couldn't load more results"));
    } finally {
      if (seq === searchSeq.current) setLoadingMore(false);
    }
  };

  const loadMoreChats = useCallback(async () => {
    if (chatsBusy.current || chatsDone) return;
    chatsBusy.current = true;
    setChatsLoading(true);
    setChatsError(null);
    try {
      const r = await insightsApi.listSessions(chatsCursor);
      setChats((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.sessions.filter((x) => !seen.has(x.id))];
      });
      setChatsCursor(r.nextCursor);
      if (!r.nextCursor) setChatsDone(true);
    } catch (e) {
      setChatsError(errorText(e, "Couldn't load your chats"));
    } finally {
      chatsBusy.current = false;
      setChatsLoading(false);
    }
  }, [chatsCursor, chatsDone]);

  const shown = trimmed.length >= 2 ? results : null;
  const resultsSentinel = useInfiniteScroll(() => void loadMoreResults(), !!shown && nextOffset !== null && !error);
  const chatsSentinel = useInfiniteScroll(() => void loadMoreChats(), !shown && !chatsDone && !chatsError);
  const open = (sessionId: string) => navigate(`/chathome?session=${sessionId}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!shown?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); open(shown[active].session_id); }
  };

  return (
    <div className="ag_page srch_page">
      <h1 className="ag_page__title">Search chats</h1>
      <p className="ag_page__subtitle">Find any conversation by its title or by something said in it.</p>

      <label className="srch_box">
        <Search size={18} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search your chats…"
          aria-label="Search chats"
        />
        {loading && <LoaderCircle size={16} className="spin srch_box__spin" />}
        {query && <button type="button" className="ag_icon_btn" aria-label="Clear search" onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}><X size={16} /></button>}
      </label>
      <p className="srch_hint ag_muted ag_small">Tip: press <kbd>Ctrl</kbd> + <kbd>K</kbd> anywhere to open search · <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</p>

      {error && <div className="ag_error">{error}</div>}

      {shown && (
        <>
          <p className="ag_muted ag_small srch_count">
            {shown.length === 0 ? `No chats match “${trimmed}”.` : `${shown.length} chat${shown.length === 1 ? "" : "s"} match “${trimmed}”`}
          </p>
          <ul className="srch_results" role="listbox">
            {shown.map((r, i) => (
              <li key={r.session_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`srch_result ${i === active ? "is_active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => open(r.session_id)}
                >
                  <div className="srch_result__head">
                    <MessageSquare size={15} className="srch_result__icon" />
                    <strong className="srch_result__title"><Highlight text={r.title || "New Chat"} query={trimmed} /></strong>
                    <SourceBadge r={r} />
                    <span className="ag_muted ag_small srch_result__when">{relative(r.updated_at)}</span>
                  </div>
                  {r.snippets.map((s, j) => (
                    <p key={j} className="srch_snippet">
                      <span className="srch_snippet__who">{s.role === "user" ? "You" : "Owl"}:</span> <Highlight text={s.text} query={trimmed} />
                    </p>
                  ))}
                  {r.match_count > r.snippets.length && <span className="ag_muted ag_small srch_more">+{r.match_count - r.snippets.length} more match{r.match_count - r.snippets.length === 1 ? "" : "es"} in this chat</span>}
                </button>
              </li>
            ))}
          </ul>
          {loadingMore && <SkeletonRows count={3} />}
          {nextOffset !== null && <div ref={resultsSentinel} className="srch_sentinel" />}
        </>
      )}

      {!shown && (
        <section className="srch_recent">
          <span className="ag_field__label">All chats</span>
          {chatsDone && chats.length === 0 && <p className="ag_muted ag_small">No chats yet.</p>}
          <ul className="srch_results">
            {chats.map((s) => (
              <li key={s.id}>
                <button type="button" className="srch_result srch_result--compact" onClick={() => open(s.id)}>
                  <div className="srch_result__head">
                    <MessageSquare size={15} className="srch_result__icon" />
                    <strong className="srch_result__title">{s.title || "New Chat"}</strong>
                    <SourceBadge r={{ source: s.source ?? null, agent_icon: s.agent_icon ?? null, agent_name: s.agent_name ?? null }} />
                    <span className="ag_muted ag_small srch_result__when">{relative(s.updated_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {chatsLoading && <SkeletonRows count={chats.length ? 3 : 8} />}
          {chatsError && (
            <div className="ag_error srch_load_error">
              {chatsError} <button type="button" className="srch_retry" onClick={() => void loadMoreChats()}>Try again</button>
            </div>
          )}
          {!chatsDone && !chatsError && <div ref={chatsSentinel} className="srch_sentinel" />}
          {chatsDone && chats.length > 0 && <p className="ag_muted ag_small srch_end">That's all {chats.length} chat{chats.length === 1 ? "" : "s"}.</p>}
        </section>
      )}
    </div>
  );
};
