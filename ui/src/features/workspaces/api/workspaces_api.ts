import { BaseApi } from "@/shared/api/base_fetch";

export type WorkspaceRole = "owner" | "admin" | "member";
export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRole; memberCount: number; createdAt: string };
export type WorkspaceMember = { userId: string; role: WorkspaceRole; name: string; email: string | null; phoneHint: string | null; joinedAt: string };
export type WorkspaceInvite = { id: string; role: Exclude<WorkspaceRole, "owner">; maxUses: number; uses: number; expiresAt: string; createdAt: string };
export type WorkspaceDetail = {
  id: string; name: string; role: WorkspaceRole; createdAt: string; maxMembers: number;
  members: WorkspaceMember[]; invites: WorkspaceInvite[];
};
export type InvitePreview = { workspaceId: string; workspaceName: string; role: WorkspaceRole; usable: boolean; alreadyMember: boolean; expiresAt: string };
export type AuditEvent = { id: number; action: string; actor: string; target: string | null; details: Record<string, unknown>; createdAt: string };

// Client for /api/workspaces (backend routes/workspace_routes.ts).
class WorkspacesApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  async list() { return (await this.get<{ workspaces: WorkspaceSummary[] }>("/workspaces")).workspaces; }
  create(name: string) { return this.post<WorkspaceSummary>("/workspaces", { name }); }
  detail(id: string) { return this.get<WorkspaceDetail>(`/workspaces/${id}`); }
  rename(id: string, name: string) { return this.send<{ id: string; name: string }>("PATCH", `/workspaces/${id}`, { name }); }
  remove(id: string, confirmName: string) { return this.send<void>("DELETE", `/workspaces/${id}`, { confirmName }); }

  setRole(id: string, userId: string, role: "admin" | "member") { return this.send<WorkspaceDetail>("PATCH", `/workspaces/${id}/members/${encodeURIComponent(userId)}`, { role }); }
  removeMember(id: string, userId: string) { return this.delete<void>(`/workspaces/${id}/members/${encodeURIComponent(userId)}`); }
  transfer(id: string, userId: string) { return this.post<WorkspaceDetail>(`/workspaces/${id}/transfer`, { userId }); }

  createInvite(id: string, opts: { role: "admin" | "member"; maxUses: number; expiresInDays: number }) {
    return this.post<WorkspaceInvite & { token: string }>(`/workspaces/${id}/invites`, opts);
  }
  revokeInvite(id: string, inviteId: string) { return this.delete<void>(`/workspaces/${id}/invites/${inviteId}`); }
  previewInvite(token: string) { return this.get<InvitePreview>(`/workspaces/invites/${encodeURIComponent(token)}`); }
  acceptInvite(token: string) { return this.post<{ workspaceId: string; role: WorkspaceRole; already: boolean }>(`/workspaces/invites/${encodeURIComponent(token)}/accept`, {}); }

  async audit(id: string, before?: number) { return (await this.get<{ events: AuditEvent[] }>(`/workspaces/${id}/audit`, { before })).events; }

  // PATCH, and DELETE with a body (the shared helpers don't send one).
  private send<T>(method: "PATCH" | "DELETE", path: string, body: unknown) {
    return this.request<T>(path, { method, body: JSON.stringify(body) });
  }
}

export const workspacesApi = new WorkspacesApi();

export const inviteLink = (token: string) => `${window.location.origin}/join/${token}`;
export const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
