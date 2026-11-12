// Team workspaces need a shared server. The desktop app is one person's
// space, so there is never a membership.
export type Membership = { id: string; name: string; role: "owner" | "admin" | "member" };

export interface WorkspaceService {
    record(workspaceId: string, userId: string, action: string, targetId: string, details?: Record<string, unknown>): Promise<void>;
}

// The knowledge-base folder: the user's own.
export const kbScopeFor = (workspaceId: string | null | undefined, userId: string) => (workspaceId ? `ws_${workspaceId}` : userId);
