import { Router } from "express";

// Answers for things the web app asks about that have no meaning on one
// computer, so its screens stay quiet instead of showing errors: there are no
// plans or payments, no team workspaces, no app owner, no WhatsApp bot and no
// provider-hosted agents. The shared knowledge base answers empty (agents
// get their own files instead).
export function createShellRouter(): Router {
    const r = Router();

    r.get("/api/billing", (_req, res) => res.json({
        paymentsEnabled: false, enforced: false, keyId: null, plan: "local", subscription: null,
        usage: { used: 0, quota: 0, resetsAt: new Date().toISOString(), exempt: true }, plans: [],
    }));
    r.get("/api/admin/me", (_req, res) => res.json({ isOwner: false, ownersConfigured: false }));
    r.get("/api/workspaces", (_req, res) => res.json({ workspaces: [] }));
    r.get("/api/whatsapp/status", (_req, res) => res.json({ enabled: false, botConnected: false, link: null }));
    r.get("/api/native-agents", (_req, res) => res.json({ activeProvider: null, canWriteCode: false, providers: [], agents: [] }));
    r.get("/documents", (_req, res) => res.json({ documents: [] }));

    return r;
}
