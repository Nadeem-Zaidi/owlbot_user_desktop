// The desktop app has no sign-in service: whoever uses this computer is the
// user. This file keeps the small part of the Firebase Auth API the screens
// use (auth.currentUser, getIdToken, onAuthStateChanged, signOut), backed by
// the app's own launch token, so every screen works unchanged.
//
// The token reaches the page from the desktop app (window.owlLocal, set by
// the preload script) or, when the engine runs on its own for development,
// from the address it prints (…/?token=… — kept for this tab only).

declare global {
  interface Window {
    owlLocal?: { token: string; userName?: string };
  }
}

const TOKEN_KEY = "owl_local_token";

function launchToken(): string | null {
  if (window.owlLocal?.token) return window.owlLocal.token;
  const fromUrl = new URLSearchParams(location.search).get("token");
  try {
    if (fromUrl) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl);
      history.replaceState(null, "", location.pathname + location.hash);
    }
    return fromUrl ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return fromUrl;
  }
}

export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  // Always set: the server-side "verified phone" rule doesn't apply here.
  phoneNumber: string | null;
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

const token = launchToken();
const localUser: User | null = token
  ? {
      uid: "local",
      email: null,
      displayName: window.owlLocal?.userName || "You",
      phoneNumber: "local",
      getIdToken: async () => token,
    }
  : null;

export const auth = {
  currentUser: localUser,
  // There's no account to leave; "Log out" just reloads the app.
  async signOut(): Promise<void> {},
};

export function onAuthStateChanged(_auth: typeof auth, callback: (user: User | null) => void): () => void {
  queueMicrotask(() => callback(localUser));
  return () => {};
}

export function getAuth() {
  return auth;
}

export default auth;
