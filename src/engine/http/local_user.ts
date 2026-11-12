import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";

// The desktop app has one user: whoever is signed in to this computer. There
// is no sign-in screen; the server only answers the app's own window, which
// proves itself with a token made fresh at every launch (see main.ts).
export type LocalUser = { uid: string; sub: string; email: string; name: string };

declare global {
    namespace Express {
        interface Request {
            user?: LocalUser;
            // Team workspaces don't exist here; routes shared with the server read it.
            workspace?: null;
        }
    }
}

export const LOCAL_USER_ID = "local";

export function localAuth(token: string, user: LocalUser) {
    const expected = Buffer.from(token);
    return (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization ?? "";
        const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
            return res.status(401).json({ code: "token_missing", message: "This address only answers the Owl app." });
        }
        req.user = user;
        req.workspace = null;
        next();
    };
}
