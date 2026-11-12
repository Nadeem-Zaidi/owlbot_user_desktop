// Email delivery (schedules can mail their result) needs an SMTP server; the
// desktop app has none yet. The types stay so schedules validate the same way.
export const MAX_RECIPIENTS = 5;

export function normalizeRecipients(v: unknown, max = MAX_RECIPIENTS): string[] {
    const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [])
        .map((s) => String(s).trim().toLowerCase())
        .filter(Boolean);
    const unique = [...new Set(list)];
    if (unique.length > max) throw new Error(`At most ${max} email addresses`);
    const bad = unique.find((e) => !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(e));
    if (bad) throw new Error(`"${bad}" isn't a valid email address`);
    return unique;
}

export type EmailMessage = { to: string[]; subject: string; text: string };
export type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailService {
    readonly enabled: boolean;
    sendForUser(userId: string, message: EmailMessage): Promise<SendResult>;
}
