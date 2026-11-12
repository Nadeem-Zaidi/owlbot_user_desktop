import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { LLMProviderOption } from "@/features/chat/api/chat_api";
import type { LLMSelection } from "@/features/chat/hooks/use_llm_provider";

type ModelSelectorProps = {
  providers: LLMProviderOption[];
  value: LLMSelection | undefined;
  onChange: (next: LLMSelection) => void;
  disabled?: boolean;
  // Adds a "Browse more models…" entry (the model marketplace).
  onBrowse?: () => void;
};

// With this many models a filter box appears at the top.
const FILTER_FROM = 8;

// "DeepSeek · your key" → "DeepSeek"; the badge says "your key" instead.
const groupName = (p: LLMProviderOption) => (p.byok ? p.label.replace(/\s*·\s*your key$/i, "") : p.label);

// The composer's model picker: a pill that opens a grouped menu, one group per
// provider (the server's models, then the user's own keys).
export const ModelSelector = ({ providers, value, onChange, disabled, onBrowse }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const optionCount = providers.reduce((n, p) => n + p.models.length, 0);
  const current = providers.find((p) => p.id === value?.provider);
  const currentModel = current?.models.find((m) => m.id === value?.model);
  const hasChoice = optionCount > 1 || !!onBrowse;

  // What's shown (filtered by the box), and the same as one flat list for the arrow keys.
  const q = query.trim().toLowerCase();
  const groups = providers
    .map((p) => ({ p, models: p.models.filter((m) => !q || m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || groupName(p).toLowerCase().includes(q)) }))
    .filter((g) => g.models.length);
  const flat = groups.flatMap((g) => g.models.map((m) => ({ provider: g.p.id, model: m.id })));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Start on the current model, and keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    const i = flat.findIndex((o) => o.provider === value?.provider && o.model === value?.model);
    setActive(i < 0 ? 0 : i);
    requestAnimationFrame(() => (optionCount >= FILTER_FROM ? filterRef.current : listRef.current)?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!optionCount) return null;

  const pick = (o: LLMSelection) => {
    onChange(o);
    setOpen(false);
    setQuery("");
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      pick(flat[active]);
    }
  };

  let index = -1;
  return (
    <div className="model_selector" ref={rootRef}>
      <button
        type="button"
        className={`model_selector__trigger ${open ? "is_open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !hasChoice}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={currentModel && current ? `${groupName(current)} · ${currentModel.id}` : "Choose model"}
      >
        <span className="model_selector__value">{currentModel?.label ?? "Choose model"}</span>
        {current?.byok && <span className="model_selector__badge">Your key</span>}
        {hasChoice && <ChevronDown size={14} className="model_selector__chevron" aria-hidden="true" />}
      </button>

      {open && (
        <div className="model_selector__popover" onKeyDown={onKeyDown}>
          {optionCount >= FILTER_FROM && (
            <label className="model_selector__filter">
              <Search size={14} aria-hidden="true" />
              <input ref={filterRef} value={query} placeholder="Find a model" aria-label="Find a model"
                onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
            </label>
          )}
          <div className="model_selector__list" role="listbox" aria-label="Model" tabIndex={-1} ref={listRef}
            aria-activedescendant={flat[active] ? `model_opt_${active}` : undefined}>
            {groups.map(({ p, models }) => (
              <div key={p.id} role="group" aria-label={groupName(p)}>
                <div className="model_selector__group">
                  <span>{groupName(p)}</span>
                  {p.byok && <span className="model_selector__badge">Your key</span>}
                </div>
                {models.map((m) => {
                  index++;
                  const i = index;
                  const selected = p.id === value?.provider && m.id === value?.model;
                  return (
                    <div
                      key={m.id}
                      id={`model_opt_${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      className={`model_selector__option ${i === active ? "is_active" : ""} ${selected ? "is_selected" : ""}`}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick({ provider: p.id, model: m.id })}
                      title={m.id}
                    >
                      <span className="model_selector__label">{m.label}</span>
                      {selected && <Check size={15} className="model_selector__check" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            ))}
            {!groups.length && <div className="model_selector__empty">No models match “{query}”</div>}
          </div>
          {onBrowse && (
            <button type="button" className="model_selector__browse" onClick={() => { setOpen(false); onBrowse(); }}>
              Browse more models…
            </button>
          )}
        </div>
      )}
    </div>
  );
};
