import express, { NextFunction, Request, Response, Router } from "express";
import { StudioService } from "../core/studio/studio_service";

type Handler = (req: Request, res: Response) => Promise<unknown>;

const h = (fn: Handler) => (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((err: any) => {
        const status = Number(err?.status ?? err?.statusCode) || 500;
        if (status >= 500) console.error("[studio] request failed:", err);
        if (!res.headersSent) res.status(status).json({ message: status >= 500 ? "Something went wrong" : err?.message ?? "Request failed" });
    });
};

// /api/studio — Agent Studio projects of the signed-in user (behind Firebase auth).
// Runs, approvals and cancelling use /api/pipelines/runs/… like Workflows.
export function createStudioRouter(studio: StudioService): Router {
    const r = Router();
    const uid = (req: Request) => req.user!.sub;
    const id = (req: Request) => String(req.params.id);
    r.get("/", h(async (req, res) => res.json({ projects: await studio.list(uid(req)) })));
    r.post("/", h(async (req, res) => res.status(201).json(await studio.save(uid(req), null, req.body))));
    // One agent with sample input, as set up on the canvas (nothing saved).
    r.post("/test-step", h(async (req, res) => res.json(await studio.testStep(uid(req), req.body))));
    r.get("/:id", h(async (req, res) => res.json(await studio.get(uid(req), id(req)))));
    r.put("/:id", h(async (req, res) => res.json(await studio.save(uid(req), id(req), req.body))));
    r.delete("/:id", h(async (req, res) => res.json(await studio.remove(uid(req), id(req)))));
    r.post("/:id/run", h(async (req, res) => res.status(202).json(await studio.run(uid(req), id(req), req.body?.input))));
    r.post("/:id/webhook/rotate", h(async (req, res) => res.json(await studio.rotateWebhook(uid(req), id(req)))));
    return r;
}
