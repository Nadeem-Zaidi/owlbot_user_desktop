import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "@/shared/lib/firebase";
import { useLocation, useNavigate } from "react-router-dom";
import { rememberAfterLogin } from "@/shared/lib/workspace";
import { auth } from "@/shared/lib/firebase";
import { OwlLoader } from "@/shared/ui/owl_loader";
import { signOutAndReset } from "@/features/auth/api/session";

// When coming back to the tab, re-check the session with Firebase at most this often.
const RECHECK_MS = 5 * 60_000;

// Pages behind sign-in. Sends visitors who aren't signed in — or haven't
// finished sign-up (verified phone) — to the sign-in screen. The backend
// enforces the same rules on every API call; this keeps the UI consistent.
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.phoneNumber) {
        setAllowed(true);
      } else {
        setAllowed(false);
        // e.g. an invite link: come back to it after signing in.
        rememberAfterLogin(location.pathname + location.search);
        navigate("/", { replace: true });
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; the path is read at redirect time
  }, [navigate]);

  // A session revoked elsewhere ("log out of all devices"), or a disabled
  // account, fails to refresh: sign out here too instead of showing errors.
  useEffect(() => {
    let last = Date.now();
    const recheck = () => {
      const user = auth.currentUser;
      if (!user || document.visibilityState !== "visible" || Date.now() - last < RECHECK_MS) return;
      last = Date.now();
      user.getIdToken(true).catch((err: { code?: string }) => {
        // Offline isn't a reason to sign out.
        if (err?.code !== "auth/network-request-failed") void signOutAndReset();
      });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  if (!allowed) return <OwlLoader />;
  return <>{children}</>;
};
