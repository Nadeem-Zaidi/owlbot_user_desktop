import { auth } from "@/shared/lib/firebase";
import { getAuthHeader } from "@/features/auth/api/auth_api";

// VITE_API_URL="/api" (same-origin, production) gives "" here.
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const BASE = API_URL !== undefined ? API_URL.replace(/\/api\/?$/, "") : "http://localhost:3000";

// Saved choices that belong to the signed-in account (its workspace, its own
// API keys in the model picker, its last chat). Theme and layout stay.
const ACCOUNT_KEYS = ["owl_workspace", "llm_selection", "chat_state"];

// Signs out and starts the app fresh: a full reload drops every chat, list
// and open connection of this account, so the next person on this browser
// never sees any of it. With `everywhere`, every other device is signed out
// too (the server refuses their tokens from now on).
export async function signOutAndReset(opts: { everywhere?: boolean } = {}): Promise<void> {
    if (opts.everywhere) {
        const res = await fetch(`${BASE}/api/auth/sign-out-everywhere`, { method: "POST", headers: await getAuthHeader() });
        if (!res.ok) throw new Error("Couldn't sign out your other devices. Please try again.");
    }
    try {
        await auth.signOut();
    } finally {
        for (const key of ACCOUNT_KEYS) {
            try {
                localStorage.removeItem(key);
            } catch {
                // private mode etc. — nothing saved anyway
            }
        }
        window.location.replace("/");
    }
}
