import { Request, Response, Router } from "express";
import { SkillService } from "../service/skills/skill_service";

type Handler = (req: Request, res: Response) => Promise<unknown>;

// /api/skills: the user's skill library (UI: features/skills).
export function createSkillRouter(skills: SkillService): Router {
    const r = Router();
    const uid = (req: Request) => req.user!.sub;
    const id = (req: Request) => String(req.params.id);
    const h = (fn: Handler) => (req: Request, res: Response) => {
        fn(req, res).catch((err: any) => {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error("[skills] request failed:", err);
            if (!res.headersSent) res.status(status).json({ message: status >= 500 ? "Something went wrong" : err.message });
        });
    };

    r.get("/", h(async (req, res) => res.json({ skills: await skills.list(uid(req)) })));
    r.post("/", h(async (req, res) => res.status(201).json(await skills.create(uid(req), req.body))));
    r.post("/import", h(async (req, res) => res.status(201).json(await skills.importMarkdown(uid(req), req.body?.markdown, req.body?.fileName))));
    r.post("/import-zip", h(async (req, res) => res.status(201).json(await skills.importZip(uid(req), req.body?.zip, req.body?.fileName))));
    r.get("/:id", h(async (req, res) => res.json(await skills.get(uid(req), id(req)))));
    r.put("/:id", h(async (req, res) => res.json(await skills.update(uid(req), id(req), req.body))));
    r.delete("/:id", h(async (req, res) => {
        await skills.remove(uid(req), id(req));
        res.status(204).send();
    }));
    r.get("/:id/file", h(async (req, res) => {
        const f = await skills.getFile(uid(req), id(req), req.query.path);
        res.json({ path: f.path, kind: f.kind, bytes: f.bytes, content: f.content });
    }));
    r.delete("/:id/file", h(async (req, res) => {
        await skills.deleteFile(uid(req), id(req), req.query.path);
        res.status(204).send();
    }));
    return r;
}
