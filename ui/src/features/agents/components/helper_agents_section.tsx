import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentSummary } from "@/features/agents/types";
import { AgentAvatar } from "@/shared/ui/agent_avatar";

const MAX_HELPERS = 5;

// "Can ask other agents": each ticked agent becomes a tool this agent can
// call on its own — e.g. a Project Manager that asks the Jira Agent to fetch
// a ticket and the Maximo Developer to design it, then answers you.
export const HelperAgentsSection = ({ agentId, ids, onChange }: { agentId?: string; ids: string[]; onChange: (ids: string[]) => void }) => {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  useEffect(() => {
    agentsApi.list().then(setAgents).catch(() => setAgents([]));
  }, []);

  const others = (agents ?? []).filter((a) => a.id !== agentId);
  const toggle = (id: string, on: boolean) => onChange(on ? [...ids, id] : ids.filter((x) => x !== id));
  const missing = ids.filter((id) => agents && !agents.some((a) => a.id === id));

  return (
    <section className="ag_section">
      <h2 className="ag_section__title"><Bot size={16} /> Can ask other agents</h2>
      <p className="ag_muted ag_small">
        This agent can hand parts of a task to the agents you tick — each with its own model, tools and MCP servers — and use their answers.
        It decides when to ask. Up to {MAX_HELPERS}; asked agents can ask their own helpers one more level down.
      </p>
      {agents === null ? <span className="ag_muted ag_small">Loading your agents…</span> : others.length === 0 ? (
        <p className="ag_muted ag_small">Create another agent first — then you can let this one ask it.</p>
      ) : (
        <div className="ag_helpers">
          {others.map((a) => {
            const on = ids.includes(a.id);
            const full = !on && ids.length >= MAX_HELPERS;
            return (
              <label key={a.id} className={`ag_helper ${on ? "is_on" : ""} ${full ? "is_disabled" : ""}`} title={full ? `At most ${MAX_HELPERS} agents` : undefined}>
                <input type="checkbox" checked={on} disabled={full} onChange={(e) => toggle(a.id, e.target.checked)} />
                <span className="ag_helper__avatar"><AgentAvatar icon={a.icon} /></span>
                <span className="ag_helper__text">
                  <strong>{a.name}</strong>
                  {a.description && <span className="ag_muted ag_small">{a.description}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {ids.length > 0 && <p className="ag_muted ag_small">{ids.length} of {MAX_HELPERS} · Tip: give each helper a clear description — it tells this agent when to ask it.</p>}
      {missing.length > 0 && (
        <button type="button" className="ag_link_btn ag_small" onClick={() => onChange(ids.filter((id) => !missing.includes(id)))}>
          Remove {missing.length} deleted agent{missing.length === 1 ? "" : "s"} from the list
        </button>
      )}
    </section>
  );
};
