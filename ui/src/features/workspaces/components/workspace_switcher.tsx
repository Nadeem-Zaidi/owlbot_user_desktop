import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Settings, User, Users } from "lucide-react";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";
import { ROLE_LABEL, workspacesApi } from "@/features/workspaces/api/workspaces_api";
import { useWorkspaces } from "@/features/workspaces/lib/use_workspaces";
import { switchWorkspace } from "@/shared/lib/workspace";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Top of the sidebar: which space you're in (Personal or a team), and
// switching between them. Switching reloads the app so every page shows
// that space's agents and knowledge base.
export const WorkspaceSwitcher = ({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate: (path: string) => void }) => {
  const { workspaces, active } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const label = active?.name ?? "Personal";

  return (
    <div className={`ws_switch ${collapsed ? "is_collapsed" : ""}`} ref={rootRef}>
      <button type="button" className="ws_switch__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        title={`Workspace: ${label}`}>
        <span className={`ws_avatar ${active ? "is_team" : ""}`}>{active ? initials(active.name) : <User size={14} />}</span>
        {!collapsed && (
          <>
            <span className="ws_switch__text">
              <span className="ws_switch__name">{label}</span>
              <span className="ws_switch__sub">{active ? `${ROLE_LABEL[active.role]} · ${active.memberCount} member${active.memberCount === 1 ? "" : "s"}` : "Just you"}</span>
            </span>
            <ChevronsUpDown size={15} className="ws_switch__chev" />
          </>
        )}
      </button>

      {open && (
        <div className="ws_menu" role="menu" aria-label="Switch workspace">
          <div className="ws_menu__label">Workspaces</div>
          <button type="button" role="menuitemradio" aria-checked={!active} className="ws_menu__item" onClick={() => { setOpen(false); if (active) switchWorkspace(null, { goTo: "/agents" }); }}>
            <span className="ws_avatar"><User size={13} /></span>
            <span className="ws_menu__text"><span>Personal</span><span className="ws_menu__hint">Just you</span></span>
            {!active && <Check size={15} className="ws_menu__check" />}
          </button>
          {workspaces === null ? (
            <div className="ws_menu__hint ws_menu__pad">Loading…</div>
          ) : workspaces.map((w) => (
            <button key={w.id} type="button" role="menuitemradio" aria-checked={active?.id === w.id} className="ws_menu__item"
              onClick={() => { setOpen(false); if (active?.id !== w.id) switchWorkspace(w.id, { goTo: "/agents" }); }}>
              <span className="ws_avatar is_team">{initials(w.name)}</span>
              <span className="ws_menu__text"><span>{w.name}</span><span className="ws_menu__hint">{ROLE_LABEL[w.role]} · {w.memberCount} member{w.memberCount === 1 ? "" : "s"}</span></span>
              {active?.id === w.id && <Check size={15} className="ws_menu__check" />}
            </button>
          ))}
          <div className="ws_menu__sep" role="separator" />
          {active && (
            <button type="button" role="menuitem" className="ws_menu__item ws_menu__action" onClick={() => { setOpen(false); onNavigate("/settings/workspace"); }}>
              <Settings size={15} /> Members & settings
            </button>
          )}
          <button type="button" role="menuitem" className="ws_menu__item ws_menu__action" onClick={() => { setOpen(false); setCreating(true); }}>
            <Plus size={15} /> New team workspace
          </button>
        </div>
      )}

      {creating && <CreateWorkspaceDialog onClose={() => setCreating(false)} />}
    </div>
  );
};

export const CreateWorkspaceDialog = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const w = await workspacesApi.create(name.trim());
      // Into the new workspace, straight to inviting people.
      switchWorkspace(w.id, { goTo: "/settings/workspace?invite=1" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the workspace");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New team workspace"
      subtitle="Share agents and a knowledge base with your team. Everyone's chats stay private."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void create()} busy={busy} disabled={!name.trim()}><Users size={15} /> Create workspace</Button>
        </>
      }
    >
      <Field label="Workspace name" hint="Your company, client or project — you can change it later.">
        <input className="ag_input" value={name} maxLength={60} autoFocus placeholder="e.g. Acme Maximo team"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void create(); }} />
      </Field>
      <ErrorNote message={error} />
    </Modal>
  );
};
