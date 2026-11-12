import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// A saved secret that the current key can't open (the key was lost or
// replaced). Shown to the user as is.
export class SecretUnreadableError extends Error {
    readonly status = 400;
    constructor() {
        super("A saved secret (such as an MCP server's access token) can't be read any more: the key that encrypted it was lost. Open the agent and enter the token again.");
    }
}

// Encrypts secrets users attach to agents (API tokens in function headers,
// MCP auth tokens) before they're stored in Postgres. AES-256-GCM.
//
// Key: AGENT_SECRETS_KEY from .env. If that's unset, a random key is created
// once in .agent_secrets_key (git-ignored) so things work out of the box.
// Losing the key makes saved secrets unreadable — re-enter them.

const PREFIX = "enc:v1:";
let KEY_FILE = path.resolve(process.cwd(), ".agent_secrets_key");

let cachedKey: Buffer | null = null;

// The desktop app keeps the key with its database (not in whatever folder it
// was started from). A key already in the start folder is moved over once,
// so secrets saved with it stay readable.
export function useSecretsKeyDir(dir: string) {
    const target = path.join(dir, ".agent_secrets_key");
    const old = path.resolve(process.cwd(), ".agent_secrets_key");
    if (!existsSync(target) && old !== target && existsSync(old)) copyFileSync(old, target);
    KEY_FILE = target;
    cachedKey = null;
}

function key(): Buffer {
    if (cachedKey) return cachedKey;
    let material = process.env.AGENT_SECRETS_KEY;
    if (!material && process.env.NODE_ENV === "production") {
        // Each server would create its own key file and couldn't read secrets
        // saved by the others.
        throw new Error("AGENT_SECRETS_KEY must be set in production (the same value on every server).");
    }
    if (!material) {
        if (!existsSync(KEY_FILE)) {
            writeFileSync(KEY_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
            console.warn(`[agents] AGENT_SECRETS_KEY not set — created ${KEY_FILE}. Keep it safe; it decrypts saved agent secrets.`);
        }
        material = readFileSync(KEY_FILE, "utf-8").trim();
    }
    cachedKey = createHash("sha256").update(material).digest();
    return cachedKey;
}

export function encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const data = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptSecret(stored: string): string {
    if (!stored.startsWith(PREFIX)) return stored;
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    try {
        const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf-8");
    } catch {
        throw new SecretUnreadableError();
    }
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

// What the UI sees instead of a secret.
export const SECRET_MASK = "••••••••";
