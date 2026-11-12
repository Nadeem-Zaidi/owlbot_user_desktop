import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentCatalog } from "@/features/agents/types";
import type { StepAgent } from "@/features/pipelines/api/pipeline_agents";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// Create an agent without leaving the workflow: the essentials here, the
// rest (functions, MCP, files, schedules) later on the Agents page.
export const NewAgentDialog = ({ onClose, onCreated, suggestedName = "" }: {
  onClose: () => void;
  onCreated: (agent: StepAgent) => void;
  suggestedName?: string;
}) => {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [name, setName] = useState(suggestedName);
  const [icon, setIcon] = useState("🤖");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [tools, setTools] = useState<string[]>(["search_knowledge_base"]);
  const [idea, setIdea] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentsApi.catalog().then(setCatalog).catch((e) => setError(errorText(e, "Couldn't load models")));
  }, []);

  const prov = catalog?.providers.find((p) => p.id === provider);

  // "Describe it" → name, instructions and tools filled in by the AI.
  const draft = async () => {
    setDrafting(true);
    setError(null);
    try {
      const d = await agentsApi.draft(idea);
      setName(d.name || name);
      setIcon(d.icon || icon);
      setDescription(d.description || "");
      setInstructions(d.instructions || "");
      if (d.builtin_tools?.length) setTools(d.builtin_tools);
    } catch (e) {
      setError(errorText(e, "Couldn't draft the agent"));
    } finally {
      setDrafting(false);
    }
  };

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const a = await agentsApi.create({
        name: name.trim(), icon: icon.trim() || "🤖", description: description.trim(), instructions,
        provider: provider || null, model: provider ? model || null : null,
        builtin_tools: tools, document_keys: [], starters: [], instruction_files: [], skill_mode: "all", skill_ids: [],
      });
      onCreated({ kind: "agent", id: a.id, name: a.name, icon: a.icon, description: a.description, active: true });
    } catch (e) {
      setError(errorText(e, "Couldn't create the agent"));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New agent"
      subtitle="It's added to this step and saved to your Agents, so you can reuse it anywhere."
      onClose={onClose}
      wide
      footer={
        <>
          <ErrorNote message={error} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void create()} busy={saving} disabled={!name.trim() || drafting}>Create and use</Button>
        </>
      }
    >
      <div className="wf_newagent">
        <div className="wf_newagent__draft">
          <input className="ag_input" value={idea} maxLength={4000} onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe it, e.g. “Checks invoices for errors and lists the problems”" aria-label="Describe the agent" />
          <Button onClick={() => void draft()} busy={drafting} disabled={!idea.trim() || saving}><Sparkles size={14} /> Draft it</Button>
        </div>
        <div className="wf_newagent__row">
          <Field label="Icon"><input className="ag_input wf_newagent__icon" value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} /></Field>
          <Field label="Name"><input className="ag_input" value={name} maxLength={60} placeholder="e.g. Invoice checker" onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        </div>
        <Field label="Description (optional)"><input className="ag_input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Instructions" hint="Who the agent is and how it should work.">
          <textarea className="ag_input" rows={5} value={instructions} maxLength={20000} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
        <div className="wf_newagent__row2">
          <Field label="Model">
            <select className="ag_input" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); }}>
              <option value="">Your default model</option>
              {(catalog?.providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          {prov && (
            <Field label="Version">
              <select className="ag_input" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Default ({prov.defaultModel})</option>
                {prov.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          )}
        </div>
        <fieldset className="wf_newagent__tools">
          <legend className="ag_field__label">Tools</legend>
          {(catalog?.builtinTools ?? []).map((t) => (
            <label key={t.id} className="wf_newagent__tool" title={t.description}>
              <input type="checkbox" checked={tools.includes(t.id)} onChange={(e) => setTools((xs) => (e.target.checked ? [...xs, t.id] : xs.filter((x) => x !== t.id)))} />
              <span>{t.label}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
};
