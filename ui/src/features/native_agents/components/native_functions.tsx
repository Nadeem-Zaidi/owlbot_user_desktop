import { useEffect, useState } from "react";
import { Code2, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import type { AgentFunction, CodeFunction } from "@/features/agents/types";
import { FunctionDialog } from "@/features/agents/components/function_dialog";
import { CodeFunctionDialog } from "@/features/agents/components/code_function_dialog";
import { Button, ConfirmDialog, ErrorNote, Modal, Toggle } from "@/shared/ui/ui";
import { nativeAgentsApi, PROVIDER_LABEL, type NativeAgent, type NativeFunctions } from "@/features/native_agents/api/native_agents_api";

type Editing =
  | { kind: "http"; fn?: AgentFunction }
  | { kind: "code"; fn?: CodeFunction };

type Deleting = { kind: "http"; fn: AgentFunction } | { kind: "code"; fn: CodeFunction };

// Functions of one provider agent. They run on this server; the provider only
// knows their names, descriptions and parameters. Reuses the regular agents'
// function editors with the provider-agent endpoints.
export const NativeFunctionsModal = ({ agent, onClose, onCountsChanged }: {
  agent: NativeAgent;
  onClose: () => void;
  onCountsChanged: (http: number, code: number) => void;
}) => {
  const [data, setData] = useState<NativeFunctions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const label = PROVIDER_LABEL[agent.provider];

  useEffect(() => {
    nativeAgentsApi.functions(agent.id).then(setData).catch((e) => setError(e.message));
  }, [agent.id]);

  const update = (next: NativeFunctions) => {
    setData(next);
    onCountsChanged(next.functions.length, next.codeFunctions.length);
  };

  const upsertHttp = (fn: AgentFunction) => data && update({ ...data, functions: replace(data.functions, fn) });
  const upsertCode = (fn: CodeFunction) => data && update({ ...data, codeFunctions: replace(data.codeFunctions, fn) });

  const toggle = async (target: Deleting, enabled: boolean) => {
    setBusy(target.fn.id);
    setError(null);
    try {
      if (target.kind === "http") upsertHttp(await nativeAgentsApi.updateFunction(agent.id, target.fn.id, { ...target.fn, enabled }));
      else upsertCode(await nativeAgentsApi.updateCodeFunction(agent.id, target.fn.id, { enabled }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the function");
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !data) return;
    setBusy(deleting.fn.id);
    try {
      if (deleting.kind === "http") {
        await nativeAgentsApi.deleteFunction(agent.id, deleting.fn.id);
        update({ ...data, functions: data.functions.filter((f) => f.id !== deleting.fn.id) });
      } else {
        await nativeAgentsApi.deleteCodeFunction(agent.id, deleting.fn.id);
        update({ ...data, codeFunctions: data.codeFunctions.filter((f) => f.id !== deleting.fn.id) });
      }
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the function");
    } finally {
      setBusy(null);
    }
  };

  // The editors are full dialogs of their own; show them instead of the list.
  if (editing?.kind === "http") {
    return (
      <FunctionDialog agentId={agent.id} initial={editing.fn} api={nativeAgentsApi}
        onClose={() => setEditing(null)} onSaved={(fn) => { upsertHttp(fn); setEditing(null); }} />
    );
  }
  if (editing?.kind === "code") {
    return (
      <CodeFunctionDialog agentId={agent.id} initial={editing.fn} api={nativeAgentsApi}
        onClose={() => setEditing(null)} onSaved={(fn) => { upsertCode(fn); setEditing(null); }} />
    );
  }

  const row = (target: Deleting, icon: React.ReactNode, detail: string) => (
    <li key={target.fn.id} className={`na_fn ${target.fn.enabled ? "" : "is_off"}`}>
      <span className="na_fn__icon">{icon}</span>
      <div className="na_fn__text">
        <strong className="ag_mono">{target.fn.name}</strong>
        <span className="ag_muted ag_small">{target.fn.description || detail}</span>
      </div>
      <Toggle checked={target.fn.enabled} disabled={busy === target.fn.id} label={`Enable ${target.fn.name}`} onChange={(v) => toggle(target, v)} />
      <button type="button" className="ag_icon_btn" aria-label={`Edit ${target.fn.name}`}
        onClick={() => setEditing(target.kind === "http" ? { kind: "http", fn: target.fn } : { kind: "code", fn: target.fn })}
        disabled={target.kind === "code" && !data?.canWriteCode}
        title={target.kind === "code" && !data?.canWriteCode ? "Only the app owner can edit code functions" : undefined}>
        <Pencil size={15} />
      </button>
      <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${target.fn.name}`} onClick={() => setDeleting(target)}><Trash2 size={15} /></button>
    </li>
  );

  return (
    <>
      <Modal
        wide
        title={`Functions · ${agent.name}`}
        subtitle={`${label} decides when to call them; they run on this server, so your secrets never leave it.`}
        onClose={onClose}
        footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
      >
        <div className="na_fns">
          <div className="na_fns__actions">
            <Button variant="secondary" onClick={() => setEditing({ kind: "http" })}><Globe size={14} /> HTTP function</Button>
            {data?.canWriteCode && <Button variant="secondary" onClick={() => setEditing({ kind: "code" })}><Code2 size={14} /> Python function</Button>}
          </div>

          {data === null && !error && <p className="ag_muted ag_small">Loading…</p>}
          {data && data.functions.length === 0 && data.codeFunctions.length === 0 && (
            <div className="na_fns__empty">
              <Plus size={18} />
              <p>No functions yet. Add an HTTP function to let the agent call an API{data.canWriteCode ? ", or a Python function to run your own code" : ""}.</p>
            </div>
          )}
          {data && (data.functions.length > 0 || data.codeFunctions.length > 0) && (
            <ul className="na_fn_list">
              {data.functions.map((fn) => row({ kind: "http", fn }, <Globe size={15} />, `${fn.method} ${fn.url}`))}
              {data.codeFunctions.map((fn) => row({ kind: "code", fn }, <Code2 size={15} />, "Python function"))}
            </ul>
          )}
          {data && !data.canWriteCode && data.codeFunctions.length > 0 && (
            <p className="ag_muted ag_small">Python functions can only be edited by the app owner (OWNER_EMAILS).</p>
          )}
          <ErrorNote message={error} />
        </div>
      </Modal>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.fn.name}”?`}
          message={`It's removed from the agent in ${label} too.`}
          confirmLabel="Delete function"
          busy={busy === deleting.fn.id}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
};

function replace<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}
