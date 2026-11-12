import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Check, Copy, Link2, LogOut, Settings2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote, Field, Modal } from "@/shared/ui/ui";
import {
  inviteLink, ROLE_LABEL, workspacesApi,
  type AuditEvent, type WorkspaceDetail, type WorkspaceInvite, type WorkspaceMember,
} from "@/features/workspaces/api/workspaces_api";
import { refreshWorkspaces, useWorkspaces } from "@/features/workspaces/lib/use_workspaces";
import { CreateWorkspaceDialog } from "@/features/workspaces/components/workspace_switcher";
import { switchWorkspace } from "@/shared/lib/workspace";
import { auth } from "@/shared/lib/firebase";

type Tab = "members" | "activity" | "settings";
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Settings → Workspace: members and roles, invite links, activity, and the
// workspace itself (rename, transfer ownership, leave, delete).
export const WorkspaceSettingsPage = () => {
  const { active, loaded } = useWorkspaces();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [inviting, setInviting] = useState(params.get("invite") === "1");
  const [creating, setCreating] = useState(false);
  const me = auth.currentUser?.uid;

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    workspacesApi.detail(activeId).then(setDetail).catch((e) => setError(errorText(e, "Couldn't load the workspace")));
  }, [activeId]);
  useEffect(() => { if (params.get("invite")) setParams({}, { replace: true }); }, [params, setParams]);

  if (loaded && !active) {
    return (
      <div className="ag_page st_page">
        <header className="ag_page__header"><div>
          <h1 className="ag_page__title">Team workspace</h1>
          <p className="ag_page__subtitle">You're in your personal space.</p>
        </div></header>
        <div className="ws_empty">
          <Users size={28} />
          <p><strong>Work together with a team workspace</strong></p>
          <p className="ag_muted">Share agents and a knowledge base with colleagues or a client. Everyone's chats and memory stay private.</p>
          <Button variant="primary" onClick={() => setCreating(true)}><UserPlus size={15} /> Create a team workspace</Button>
        </div>
        {creating && <CreateWorkspaceDialog onClose={() => setCreating(false)} />}
      </div>
    );
  }
  if (!detail) return <div className="ag_page st_page"><ErrorNote message={error} />{!error && <div className="ag_card ag_card--skeleton" />}</div>;

  const isAdmin = detail.role === "owner" || detail.role === "admin";
  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "members", label: "Members", icon: <Users size={15} />, show: true },
    { id: "activity", label: "Activity", icon: <Activity size={15} />, show: isAdmin },
    { id: "settings", label: "Settings", icon: <Settings2 size={15} />, show: true },
  ];

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div className="ws_head">
          <span className="ws_avatar is_team is_large">{initials(detail.name)}</span>
          <div>
            <h1 className="ag_page__title">{detail.name}</h1>
            <p className="ag_page__subtitle">
              {detail.members.length} of {detail.maxMembers} members · you're {detail.role === "owner" ? "the owner" : `a${detail.role === "admin" ? "n admin" : " member"}`}
            </p>
          </div>
        </div>
        {isAdmin && <Button variant="primary" onClick={() => setInviting(true)}><UserPlus size={15} /> Invite people</Button>}
      </header>

      <nav className="ag_tabs" role="tablist">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ag_tab ${tab === t.id ? "is_active" : ""}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>
      <ErrorNote message={error} />

      {tab === "members" && <MembersTab detail={detail} me={me} setDetail={setDetail} setError={setError} />}
      {tab === "activity" && isAdmin && <ActivityTab workspaceId={detail.id} />}
      {tab === "settings" && <SettingsTab detail={detail} me={me} setDetail={setDetail} />}

      <p className="ag_muted ag_small ws_note">
        <ShieldCheck size={13} /> Shared here: agents and the knowledge base. Private to each person: chats, memory, reminders and personal API keys.
        Team agents are billed to whoever is chatting.
      </p>

      {inviting && <InviteDialog detail={detail} onClose={() => setInviting(false)} onCreated={(inv) => setDetail({ ...detail, invites: [inv, ...detail.invites] })} />}
    </div>
  );
};

// ── members ──
const MembersTab = ({ detail, me, setDetail, setError }: {
  detail: WorkspaceDetail; me?: string; setDetail: (d: WorkspaceDetail) => void; setError: (e: string | null) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const isOwner = detail.role === "owner";
  const isAdmin = isOwner || detail.role === "admin";

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(errorText(e, "Something went wrong")); } finally { setBusy(null); }
  };
  const canRemove = (m: WorkspaceMember) => m.userId !== me && m.role !== "owner" && (isOwner || (detail.role === "admin" && m.role === "member"));

  return (
    <section className="ws_section">
      <ul className="ws_members">
        {detail.members.map((m) => (
          <li key={m.userId} className="ws_member">
            <span className="ws_avatar">{initials(m.name)}</span>
            <div className="ws_member__main">
              <strong>{m.name}{m.userId === me && <span className="ag_muted"> (you)</span>}</strong>
              <span className="ag_muted ag_small">
                {[m.email, m.phoneHint].filter(Boolean).join(" · ") || `Joined ${fmtDate(m.joinedAt)}`}
              </span>
            </div>
            {isOwner && m.role !== "owner" ? (
              <select className="ag_input ws_role_select" aria-label={`Role of ${m.name}`} value={m.role} disabled={busy === m.userId}
                onChange={(e) => void act(m.userId, async () => setDetail(await workspacesApi.setRole(detail.id, m.userId, e.target.value as "admin" | "member")))}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <span className={`ws_role ws_role--${m.role}`}>{ROLE_LABEL[m.role]}</span>
            )}
            {canRemove(m) && (
              <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Remove ${m.name}`} title="Remove from workspace" onClick={() => setRemoving(m)}>
                <Trash2 size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && <InvitesList detail={detail} setDetail={setDetail} setError={setError} />}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message="They lose access to this workspace's agents and knowledge base right away. Their own chats stay with them."
          confirmLabel="Remove"
          busy={busy === "remove"}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void act("remove", async () => {
            await workspacesApi.removeMember(detail.id, removing.userId);
            setDetail({ ...detail, members: detail.members.filter((x) => x.userId !== removing.userId) });
            setRemoving(null);
            void refreshWorkspaces();
          })}
        />
      )}
    </section>
  );
};

const InvitesList = ({ detail, setDetail, setError }: { detail: WorkspaceDetail; setDetail: (d: WorkspaceDetail) => void; setError: (e: string | null) => void }) => {
  if (!detail.invites.length) return null;
  const revoke = async (inv: WorkspaceInvite) => {
    try {
      await workspacesApi.revokeInvite(detail.id, inv.id);
      setDetail({ ...detail, invites: detail.invites.filter((x) => x.id !== inv.id) });
    } catch (e) { setError(errorText(e, "Couldn't revoke the link")); }
  };
  return (
    <div className="ws_invites">
      <h3 className="ws_h3"><Link2 size={15} /> Open invite links</h3>
      <ul>
        {detail.invites.map((inv) => (
          <li key={inv.id}>
            <span className={`ws_role ws_role--${inv.role}`}>{ROLE_LABEL[inv.role]}</span>
            <span className="ag_muted ag_small">{inv.uses} of {inv.maxUses} used · expires {fmtDate(inv.expiresAt)}</span>
            <Button variant="ghost" onClick={() => void revoke(inv)}>Revoke</Button>
          </li>
        ))}
      </ul>
      <p className="ag_muted ag_small">For security, links are shown only once — create a new one if you lost it.</p>
    </div>
  );
};

const InviteDialog = ({ detail, onClose, onCreated }: { detail: WorkspaceDetail; onClose: () => void; onCreated: (inv: WorkspaceInvite) => void }) => {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(7);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const inv = await workspacesApi.createInvite(detail.id, { role, maxUses, expiresInDays: days });
      setLink(inviteLink(inv.token));
      const { token: _token, ...rest } = inv;
      void _token;
      onCreated(rest);
    } catch (e) { setError(errorText(e, "Couldn't create the link")); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select manually */ }
  };

  return (
    <Modal title={`Invite people to ${detail.name}`} subtitle="Anyone with the link can join after signing in." onClose={onClose}
      footer={link ? <Button variant="primary" onClick={onClose}>Done</Button> : (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void create()} busy={busy}><Link2 size={15} /> Create link</Button>
        </>
      )}>
      {link ? (
        <div className="ws_link">
          <Field label="Invite link" hint="Copy it now — for security it isn't shown again.">
            <div className="ws_link__row">
              <input className="ag_input ag_mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
              <Button onClick={() => void copy()}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</Button>
            </div>
          </Field>
          <p className="ag_muted ag_small">Joins as {ROLE_LABEL[role].toLowerCase()} · {maxUses === 1 ? "one person" : `up to ${maxUses} people`} · valid {days} day{days === 1 ? "" : "s"}.</p>
        </div>
      ) : (
        <div className="ws_invite_form">
          <Field label="Join as">
            <select className="ag_input" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
              <option value="member">Member — uses agents, adds files and agents</option>
              {detail.role === "owner" && <option value="admin">Admin — also manages people and all agents</option>}
            </select>
          </Field>
          <div className="ag_row">
            <Field label="How many people">
              <select className="ag_input" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
                {[1, 5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n === 1 ? "One person" : `Up to ${n}`}</option>)}
              </select>
            </Field>
            <Field label="Valid for">
              <select className="ag_input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}
              </select>
            </Field>
          </div>
          <ErrorNote message={error} />
        </div>
      )}
    </Modal>
  );
};

// ── activity ──
const ACTIONS: Record<string, (e: AuditEvent) => string> = {
  "workspace.created": (e) => `${e.actor} created the workspace`,
  "workspace.renamed": (e) => `${e.actor} renamed it to “${String(e.details.name ?? "")}”`,
  "member.joined": (e) => `${e.actor} joined as ${String(e.details.role ?? "member")}`,
  "member.left": (e) => `${e.actor} left`,
  "member.removed": (e) => `${e.actor} removed ${e.target ?? "a member"}`,
  "member.role_changed": (e) => `${e.actor} made ${e.target ?? "a member"} ${String(e.details.role ?? "")}`,
  "ownership.transferred": (e) => `${e.actor} transferred ownership to ${e.target ?? "a member"}`,
  "invite.created": (e) => `${e.actor} created an invite link (${String(e.details.role ?? "member")})`,
  "invite.revoked": (e) => `${e.actor} revoked an invite link`,
  "agent.created": (e) => `${e.actor} created the agent “${String(e.details.name ?? "")}”`,
  "agent.deleted": (e) => `${e.actor} deleted the agent “${String(e.details.name ?? "")}”`,
};

const ActivityTab = ({ workspaceId }: { workspaceId: string }) => {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (before?: number) => {
    try {
      const page = await workspacesApi.audit(workspaceId, before);
      setEvents((prev) => [...(before ? prev ?? [] : []), ...page]);
      setMore(page.length === 50);
    } catch (e) { setError(errorText(e, "Couldn't load the activity")); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [workspaceId]);
  return (
    <section className="ws_section">
      <ErrorNote message={error} />
      {events === null ? <div className="ag_card ag_card--skeleton" /> : (
        <ul className="ws_activity">
          {events.map((e) => (
            <li key={e.id}>
              <span>{(ACTIONS[e.action] ?? ((x: AuditEvent) => `${x.actor}: ${x.action}`))(e)}</span>
              <span className="ag_muted ag_small">{new Date(e.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {events && more && <Button variant="ghost" onClick={() => void load(events[events.length - 1]?.id)}>Load older</Button>}
    </section>
  );
};

// ── settings ──
const SettingsTab = ({ detail, me, setDetail }: { detail: WorkspaceDetail; me?: string; setDetail: (d: WorkspaceDetail) => void }) => {
  const navigate = useNavigate();
  const [name, setName] = useState(detail.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [confirm, setConfirm] = useState<"leave" | "transfer" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isOwner = detail.role === "owner";
  const isAdmin = isOwner || detail.role === "admin";
  const others = detail.members.filter((m) => m.userId !== me);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e, "Something went wrong")); } finally { setBusy(null); }
  };

  return (
    <section className="ws_section ws_settings">
      <ErrorNote message={error} />
      {notice && <div className="ag_notice">{notice}</div>}

      <div className="ws_card">
        <Field label="Workspace name">
          <div className="ws_link__row">
            <input className="ag_input" value={name} maxLength={60} disabled={!isAdmin} onChange={(e) => setName(e.target.value)} />
            {isAdmin && <Button busy={busy === "rename"} disabled={!name.trim() || name.trim() === detail.name}
              onClick={() => void act("rename", async () => {
                const r = await workspacesApi.rename(detail.id, name.trim());
                setDetail({ ...detail, name: r.name });
                setNotice("Renamed.");
                void refreshWorkspaces();
              })}>Save</Button>}
          </div>
        </Field>
      </div>

      {isOwner && others.length > 0 && (
        <div className="ws_card">
          <Field label="Transfer ownership" hint="You become an admin. The new owner controls billing, members and deleting the workspace.">
            <div className="ws_link__row">
              <select className="ag_input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Choose a member…</option>
                {others.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
              <Button disabled={!transferTo} onClick={() => setConfirm("transfer")}>Transfer</Button>
            </div>
          </Field>
        </div>
      )}

      <div className="ws_card ws_card--danger">
        {!isOwner && (
          <div className="ws_danger_row">
            <div><strong>Leave workspace</strong><span className="ag_muted ag_small">You lose access to its agents and files. Your chats stay with you.</span></div>
            <Button variant="danger" onClick={() => setConfirm("leave")}><LogOut size={15} /> Leave</Button>
          </div>
        )}
        {isOwner && (
          <div className="ws_danger_row">
            <div><strong>Delete workspace</strong><span className="ag_muted ag_small">Deletes its shared agents and knowledge base for everyone. This can't be undone.</span></div>
            <Button variant="danger" onClick={() => setDeleting(true)}><Trash2 size={15} /> Delete</Button>
          </div>
        )}
      </div>

      {confirm === "leave" && (
        <ConfirmDialog title={`Leave ${detail.name}?`} message="You'll need a new invite to come back." confirmLabel="Leave" busy={busy === "leave"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void act("leave", async () => {
            await workspacesApi.removeMember(detail.id, me!);
            switchWorkspace(null, { goTo: "/agents" });
          })} />
      )}
      {confirm === "transfer" && (
        <ConfirmDialog title="Transfer ownership?" message={`${others.find((m) => m.userId === transferTo)?.name} becomes the owner and you become an admin.`}
          confirmLabel="Transfer" busy={busy === "transfer"} onCancel={() => setConfirm(null)}
          onConfirm={() => void act("transfer", async () => {
            setDetail(await workspacesApi.transfer(detail.id, transferTo));
            setConfirm(null);
            setNotice("Ownership transferred.");
            void refreshWorkspaces();
          })} />
      )}
      {deleting && <DeleteDialog detail={detail} onClose={() => setDeleting(false)} onDeleted={() => { switchWorkspace(null, { goTo: "/agents" }); navigate("/agents"); }} />}
    </section>
  );
};

const DeleteDialog = ({ detail, onClose, onDeleted }: { detail: WorkspaceDetail; onClose: () => void; onDeleted: () => void }) => {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Delete ${detail.name}?`} subtitle="Its shared agents and knowledge base are deleted for all members." onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={busy} disabled={typed.trim() !== detail.name}
            onClick={() => void (async () => {
              setBusy(true); setError(null);
              try { await workspacesApi.remove(detail.id, typed.trim()); onDeleted(); }
              catch (e) { setError(errorText(e, "Couldn't delete the workspace")); setBusy(false); }
            })()}>
            <Trash2 size={15} /> Delete forever
          </Button>
        </>
      }>
      <Field label={`Type “${detail.name}” to confirm`}>
        <input className="ag_input" value={typed} autoFocus onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <ErrorNote message={error} />
    </Modal>
  );
};
