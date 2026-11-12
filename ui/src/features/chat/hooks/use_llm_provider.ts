import { useEffect, useState } from "react";
import { api, type LLMProviderOption } from "@/features/chat/api/chat_api";
import { MODELS_CHANGED } from "@/features/settings/api/settings_api";
import { SHOW_MARKETPLACE } from "@/shared/lib/features";

// The "Marketplace · credits" group (backend model_registry.ts).
const MARKET_PROVIDER = "market";

const STORAGE_KEY = "llm_selection";

export type LLMSelection = { provider: string; model: string };

function readSaved(): Partial<LLMSelection> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Loads the providers/models the backend has configured and remembers the
// user's pick across reloads. `selection` is undefined until the list has
// loaded, in which case the backend falls back to its own default.
export function useLLMProvider() {
  const [providers, setProviders] = useState<LLMProviderOption[]>([]);
  const [selection, setSelectionState] = useState<LLMSelection | undefined>(undefined);

  // Bumped when the user adds/changes their own API keys, to refetch the list.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(MODELS_CHANGED, bump);
    return () => window.removeEventListener(MODELS_CHANGED, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getProviders()
      .then(({ providers, defaultProvider }) => {
        if (cancelled) return;
        // Marketplace models are hidden while the marketplace is switched off.
        providers = SHOW_MARKETPLACE ? providers : providers.filter((p) => p.id !== MARKET_PROVIDER);
        setProviders(providers);

        // A saved pick can go stale if that key or model was removed from the backend config.
        const saved = readSaved();
        const savedProvider = providers.find((p) => p.id === saved?.provider);
        if (savedProvider && savedProvider.models.some((m) => m.id === saved?.model)) {
          setSelectionState({ provider: savedProvider.id, model: saved!.model! });
          return;
        }
        const fallback = providers.find((p) => p.id === defaultProvider) ?? providers[0];
        if (fallback) setSelectionState({ provider: fallback.id, model: fallback.defaultModel });
      })
      .catch((err) => console.error("Failed to load LLM providers:", err));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const setSelection = (next: LLMSelection) => {
    setSelectionState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode etc.) — the pick just won't persist
    }
  };

  return { providers, selection, setSelection };
}
