// On the server, code functions run arbitrary Python on shared machines, so
// only the owners listed in OWNER_EMAILS may write them. The desktop app has
// a single user — whoever is signed in to this computer — and their code
// runs on their own computer, so that person is always the owner.

export function ownerEmails(): string[] {
    return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const codeFunctionsEnabled = () => true;

// Every request is made as the local user (see http/local_user.ts).
export function isOwner(email?: string | null): boolean {
    return !!email;
}
