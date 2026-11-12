import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { ROLE_LABEL, workspacesApi, type InvitePreview } from "@/features/workspaces/api/workspaces_api";
import { switchWorkspace } from "@/shared/lib/workspace";

// /join/:token — what an invite link opens (after sign-in).
export const JoinWorkspacePage = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    workspacesApi.previewInvite(token).then(setPreview).catch((e) => setError(e instanceof Error ? e.message : "This invite link isn't valid"));
  }, [token]);

  const join = async () => {
    setBusy(true); setError(null);
    try {
      const r = await workspacesApi.acceptInvite(token);
      switchWorkspace(r.workspaceId, { goTo: "/agents" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join");
      setBusy(false);
    }
  };

  return (
    <div className="ag_page ws_join">
      <div className="ws_join__card">
        <span className="ws_join__icon"><Users size={26} /></span>
        {preview ? (
          <>
            <h1>Join {preview.workspaceName}</h1>
            {preview.alreadyMember ? (
              <>
                <p className="ag_muted">You're already a member of this workspace.</p>
                <Button variant="primary" onClick={() => switchWorkspace(preview.workspaceId, { goTo: "/agents" })}>Open workspace</Button>
              </>
            ) : preview.usable ? (
              <>
                <p className="ag_muted">You've been invited as <strong>{ROLE_LABEL[preview.role].toLowerCase()}</strong>. You'll share this team's agents and knowledge base — your own chats stay private.</p>
                <Button variant="primary" busy={busy} onClick={() => void join()}>Join workspace</Button>
              </>
            ) : (
              <p className="ag_muted">This invite link has expired or was already used. Ask for a new one.</p>
            )}
          </>
        ) : !error ? <p className="ag_muted">Checking the invite…</p> : <h1>Invite not found</h1>}
        <ErrorNote message={error} />
        <Button variant="ghost" onClick={() => navigate("/chathome")}>Not now</Button>
      </div>
    </div>
  );
};
