
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace_switcher";
import {
  faBars,
  faPenToSquare,
  faMagnifyingGlass,
  faDatabase,
  faRightFromBracket,
  faRobot,
  faDiagramProject,
  faWandMagicSparkles,
  faBell,
  faChartColumn,
  faCreditCard,
  faKey,
  faBookOpen,
  faBrain,
  faFileWord,
  faSliders,
  faChevronDown,
  faCubes,
  faWallet,
  faCode,
  faSackDollar,
  faLayerGroup,
  faFolderOpen,
  faPalette,
  faUsers,
  faSun,
  faMoon,
  faDesktop,
} from "@fortawesome/free-solid-svg-icons";
import { faTelegram, faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { useSelector } from "react-redux";
import { toggleSideBar } from "@/features/chat/state/sidebar_slice";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/app/store";
import { onAuthStateChanged } from "@/shared/lib/firebase";
import { auth } from "@/shared/lib/firebase";
import { onLiveEvent } from "@/shared/lib/live_events";
import { signOutAndReset } from "@/features/auth/api/session";
import {
  loadSessions,
  setSessionPinned,
  deleteSession,
  setActiveSession,
  clearCacheMessage,
  setChatMode,
} from "@/features/chat/state/session_slice";
import { useLocation, useNavigate } from "react-router-dom";
import { OwlMark } from "@/shared/ui/owl_icon";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Pin, PinOff, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/shared/ui/ui";
import { isDesktop } from "@/shared/lib/desktop";
import { SERVER_FEATURES, SHOW_KNOWLEDGE_BASE, SHOW_MARKETPLACE, SHOW_SKILLS } from "@/shared/lib/features";
import { themeInfo, useTheme } from "@/shared/lib/theme";
import { WhatsAppConnect } from "@/features/whatsapp/components/whatsapp_connect";
import { TelegramConnect } from "@/features/telegram/components/telegram_connect";
import { BILLING_CHANGED, billingApi } from "@/features/billing/api/billing_api";
import { settingsApi } from "@/features/settings/api/settings_api";
import { UnreadAlertsBadge } from "@/features/automations/components/unread_badge";

// Compact "last active" label for a Recents row: time today, "Yesterday",
// weekday within the week, then a short date (with year if not this year).
export function formatRecentTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], d.getFullYear() === now.getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

// Sidebar width (drag its right edge). Stored per browser; every sidebar
// size in the CSS follows the --sb-w variable.
const SB_KEY = "sidebar_width";
const SB_MIN = 200;
const SB_MAX = 480;
const SB_DEFAULT = 256;
const SB_STEP = 16;
const clampWidth = (w: number) => Math.min(SB_MAX, Math.max(SB_MIN, Math.round(w)));
function readSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SB_KEY));
    return v >= SB_MIN && v <= SB_MAX ? v : SB_DEFAULT;
  } catch {
    return SB_DEFAULT;
  }
}

// Recents shows only the latest chats; the rest are a click away in Search.
const RECENTS_LIMIT = 15;
// Skeleton rows while the chat list loads for the first time (varied widths
// so it reads as a list of titles, not a block).
const SKELETON_WIDTHS = [82, 64, 74, 56, 70, 60, 78, 52];

export interface SideDrawerProps {
  /** Which chat widget this sidebar controls — must match the `windowId`
   *  passed to the paired <ChatPage />. Defaults to "chat-page" so existing
   *  call sites that don't pass this keep working unchanged. */
  windowId?: string;
}

export const SideDrawer = ({ windowId = "chat-page" }: SideDrawerProps = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Account menu (opens from the profile at the bottom of the sidebar).
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  // Fixed to the window so it isn't clipped by the (narrow, overflow-hidden) sidebar.
  const toggleAccount = (el: HTMLElement) => {
    if (accountOpen) return setAccountOpen(false);
    const r = el.getBoundingClientRect();
    setMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 8, width: Math.max(r.width, 240) });
    setAccountOpen(true);
  };
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => { if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAccountOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [accountOpen]);
  const goFromMenu = (path: string) => { setAccountOpen(false); closeMobileDrawer(); navigate(path); };
  // Owners (OWNER_EMAILS on the server) also get "Server settings".
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return setIsOwner(false);
      settingsApi.me().then((r) => setIsOwner(r.isOwner)).catch(() => setIsOwner(false));
    });
    return () => unsubscribe();
  }, []);

  // Shown under the user's name; loaded once and again after visiting billing.
  const [planName, setPlanName] = useState<string | null>(null);
  const onBilling = location.pathname === "/billing";
  useEffect(() => {
    const load = () => billingApi.overview()
      .then((o) => setPlanName(o.plans.find((p) => p.id === o.plan)?.name ?? null))
      .catch(() => setPlanName(null));
    void load();
    window.addEventListener(BILLING_CHANGED, load);
    return () => window.removeEventListener(BILLING_CHANGED, load);
  }, [onBilling]);

  // Ctrl/Cmd+K opens Search chats from anywhere the sidebar is shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  // From other pages (agents, files) — or a ?agent= chat — go back to plain chat.
  const goToChat = () => {
    if (location.pathname !== "/chathome" || location.search) navigate("/chathome");
  };
  const showSideBar = useSelector((state: any) => state.sideBar.showSideBar);
  const dispatch = useAppDispatch();
  const { sessions, status: sessionsStatus, sessionsLoaded } = useAppSelector((state) => state.session);
  // Latest activity first — also after a reply bumps an older chat's updated_at.
  const recentSessions = useMemo(
    () => [...(sessions ?? [])].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)),
    [sessions]
  );
  // Favourites first (most recently pinned on top); they leave Recents while pinned.
  const pinnedSessions = useMemo(
    () => recentSessions.filter((x) => x.pinned_at).sort((a, b) => (Date.parse(b.pinned_at!) || 0) - (Date.parse(a.pinned_at!) || 0)),
    [recentSessions]
  );
  const unpinnedSessions = useMemo(() => recentSessions.filter((x) => !x.pinned_at), [recentSessions]);
  const visibleRecents = unpinnedSessions.slice(0, RECENTS_LIMIT);
  const hiddenRecents = unpinnedSessions.length - visibleRecents.length;
  const [pinError, setPinError] = useState<string | null>(null);

  // ── resizable width ──
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sbWidth, setSbWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--sb-w", `${sbWidth}px`);
  }, [sbWidth]);
  const saveWidth = (w: number) => {
    try { localStorage.setItem(SB_KEY, String(w)); } catch { /* storage blocked */ }
  };
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
    let latest = sbWidth;
    let frame = 0;
    setResizing(true);
    document.body.classList.add("is_resizing_sidebar");
    const move = (ev: PointerEvent) => {
      latest = clampWidth(ev.clientX - left);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSbWidth(latest));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(frame);
      setSbWidth(latest);
      setResizing(false);
      document.body.classList.remove("is_resizing_sidebar");
      saveWidth(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const setWidth = (w: number) => {
    const next = clampWidth(w);
    setSbWidth(next);
    saveWidth(next);
  };
  const resizeKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowLeft: sbWidth - SB_STEP, ArrowRight: sbWidth + SB_STEP, Home: SB_MIN, End: SB_MAX };
    if (e.key in keys) {
      e.preventDefault();
      setWidth(keys[e.key]);
    }
  };

  // "More" tucks the less-used pages away (like the Claude desktop sidebar).
  // Remembered per browser. Opening one of those pages opens it too (so the
  // active item shows), but "Less" still closes it there — for that page.
  const MORE_KEY = "sidebar_more_open";
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(MORE_KEY) === "1"; } catch { return false; }
  });
  const [collapsedOn, setCollapsedOn] = useState<string | null>(null);
  // Quick Light / Dark / System switch in the account menu ("Light" keeps
  // the light theme already chosen, e.g. Indigo).
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const lightPref = themePref !== "system" && !themeInfo(themePref).dark ? themePref : "sky";
  const themeMode = themePref === "system" ? "system" : themeInfo(themePref).dark ? "dark" : "light";
  const onMorePage = location.pathname.startsWith("/pipelines") || location.pathname.startsWith("/studio") || location.pathname.startsWith("/reminders") || location.pathname.startsWith("/skills") || location.pathname.startsWith("/models");
  const showMore = moreOpen || (onMorePage && collapsedOn !== location.pathname);
  const toggleMore = () => {
    const next = !showMore;
    setMoreOpen(next);
    setCollapsedOn(next ? null : location.pathname);
    try { localStorage.setItem(MORE_KEY, next ? "1" : "0"); } catch { /* storage blocked */ }
  };
  // Delete a chat (after confirming). The store clears it from any open window.
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setPinError(null);
    const result = await dispatch(deleteSession(deleting.id));
    setDeleteBusy(false);
    if (deleteSession.rejected.match(result)) setPinError(result.payload ?? "Couldn't delete the chat");
    setDeleting(null);
  };

  const togglePin = async (sessionId: string, pinned: boolean) => {
    setPinError(null);
    const result = await dispatch(setSessionPinned({ sessionId, pinned }));
    if (setSessionPinned.rejected.match(result)) setPinError(result.payload ?? "Couldn't update the pin");
  };
  // Re-render once a minute so "Yesterday" etc. roll over without a reload.
  const [, setClock] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClock((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const activeSessionId = useAppSelector((state) => state.session.windows[windowId]?.activeSessionId ?? null);
  const streamingSessionIds = useAppSelector((state) => state.session.streamingSessionIds ?? []);
  const toggleSideBarFunc = () => {
    dispatch(toggleSideBar());
  };

  // The desktop layout docks the sidebar beside the chat pane and just
  // shrinks it to an icon rail when "collapsed" — there's no room for that
  // on a phone screen. Below the mobile breakpoint (see chat.css) it instead
  // becomes an off-canvas drawer, opened/closed with this local state
  // rather than the desktop expand/collapse state above, since the two are
  // independent concerns (one is "wide or narrow", the other is "onscreen
  // or off"). `expanded` folds them together so the drawer always renders
  // its full labeled content when a user opens it on mobile, even if the
  // desktop state happened to be left "collapsed".
  const [mobileOpen, setMobileOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const expanded = showSideBar || mobileOpen;
  const closeMobileDrawer = () => setMobileOpen(false);

  const handleClick = (sessionId: string) => {
    closeMobileDrawer();
    goToChat();
    if (sessionId === activeSessionId) return; // already viewing this chat
    dispatch(setActiveSession({ windowId, sessionId }));
    dispatch(setChatMode({ windowId, chatMode: true }));
  };

  const handleNewChat = () => {
    closeMobileDrawer();
    goToChat();
    dispatch(setActiveSession({ windowId, sessionId: null }));
    dispatch(clearCacheMessage({ windowId }));
    dispatch(setChatMode({ windowId, chatMode: false }));
  };

  // Signs out of Firebase, forgets this account's saved choices and reloads,
  // so nothing of this account stays on screen or in memory.
  const handleLogout = async (everywhere = false) => {
    closeMobileDrawer();
    if (everywhere && !window.confirm("Sign out of Owl on all your devices, including this one?")) return;
    try {
      await signOutAndReset({ everywhere });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't sign out. Please try again.");
    }
  };

  // Live: a turn finished somewhere (WhatsApp, Telegram, a schedule, another
  // tab or device) — refresh the list right away. Debounced so a burst of
  // events means one reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onLiveEvent((e) => {
      if (e.event !== "run.finished") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (auth.currentUser) dispatch(loadSessions()); }, 400);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [dispatch]);

  // Chats started on WhatsApp appear without a reload when you come back to the tab.
  useEffect(() => {
    const refresh = () => {
      if (auth.currentUser) dispatch(loadSessions());
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        dispatch(loadSessions());
      }
    });
    return () => unsubscribe();
  }, [dispatch]);

  const activeOlderChat =
    hiddenRecents > 0 && activeSessionId && !visibleRecents.some((x) => x.id === activeSessionId)
      ? unpinnedSessions.find((x) => x.id === activeSessionId) ?? null
      : null;

  const renderRow = (session: (typeof recentSessions)[number], pinned: boolean) => {
    const isStreamingInBackground = streamingSessionIds.includes(session.id);
    const title = session.title || "New Chat";
    return (
      <div
        key={session.id}
        className={`chat_history_item ${session.id === activeSessionId ? "chat_history_active" : ""} ${isStreamingInBackground ? "chat_history_streaming" : ""}`}
        onClick={() => handleClick(session.id)}
      >
        {session.agent_icon && (
          <span className="chat_history_agent" title={session.agent_name ?? "Agent"}><AgentAvatar icon={session.agent_icon} /></span>
        )}
        {session.source === "whatsapp" && (
          <FontAwesomeIcon icon={faWhatsapp} className="chat_history_source" title="Started on WhatsApp" />
        )}
        {session.source === "telegram" && (
          <FontAwesomeIcon icon={faTelegram} className="chat_history_source chat_history_source--telegram" title="Started on Telegram" />
        )}
        <span className="chat_history_title">{title}</span>
        {!isStreamingInBackground && session.updated_at && (
          <time className="chat_history_time" dateTime={session.updated_at} title={new Date(session.updated_at).toLocaleString()}>
            {formatRecentTime(session.updated_at)}
          </time>
        )}
        {isStreamingInBackground && (
          <span className="chat_history_streaming_indicator" title="Still generating…" aria-label="Still generating">
            <span className="chat_history_streaming_dot" />
            <span className="chat_history_streaming_dot" />
            <span className="chat_history_streaming_dot" />
          </span>
        )}
        <button
          type="button"
          className={`chat_history_pin ${pinned ? "is_pinned" : ""}`}
          title={pinned ? "Unpin" : "Pin to favourites"}
          aria-label={pinned ? `Unpin "${title}"` : `Pin "${title}"`}
          onClick={(e) => { e.stopPropagation(); void togglePin(session.id, !pinned); }}
        >
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          type="button"
          className="chat_history_pin chat_history_delete"
          title={isStreamingInBackground ? "Wait for the reply to finish" : "Delete chat"}
          aria-label={`Delete "${title}"`}
          disabled={isStreamingInBackground}
          onClick={(e) => { e.stopPropagation(); setDeleting({ id: session.id, title }); }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Always rendered (unlike the toggle button inside the drawer below,
          which scrolls off-screen with it when the drawer is closed) — this
          is the only way to reopen the drawer on mobile. Hidden on desktop
          via CSS; see the "MOBILE SIDEBAR DRAWER" section of chat.css. */}
      <button
        type="button"
        className="mobile_sidebar_toggle"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        <FontAwesomeIcon icon={faBars} />
      </button>

      {/* Tap-outside-to-close backdrop — mobile only (see chat.css); on
          desktop `mobileOpen` never becomes true so this never renders. */}
      {mobileOpen && <div className="sidebar_backdrop" onClick={closeMobileDrawer} />}

      <div
        ref={sidebarRef}
        className={`sidebar ${expanded ? "" : "collapsed"} ${mobileOpen ? "mobile_open" : ""} ${resizing ? "is_resizing" : ""}`.trim()}
      >
        <div className="sidebar_topsection">
          {/* Always rendered: it fades and gets clipped by the narrowing
              sidebar instead of popping in/out mid-animation. */}
          <h2 className="sidebar_brand" aria-hidden={!expanded}>
            <OwlMark size={20} />
            Owl
          </h2>
          <button className="toggle_btn" onClick={toggleSideBarFunc}>
            <FontAwesomeIcon icon={faBars} />
          </button>
        </div>

        {SERVER_FEATURES && <WorkspaceSwitcher collapsed={!expanded} onNavigate={(path) => { closeMobileDrawer(); navigate(path); }} />}

        <ul className="menu">
          <li className="menu_item menu_item--primary" onClick={handleNewChat}>
            <FontAwesomeIcon icon={faPenToSquare} className="menu_icon" />
            <span>New chat</span>
          </li>
          <li
            className={`menu_item ${location.pathname === "/search" ? "menu_item--active" : ""}`}
            title="Search chats (Ctrl+K)"
            onClick={() => {
              closeMobileDrawer();
              navigate("/search");
            }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} className="menu_icon" />
            <span>Search chats</span>
          </li>
          {SHOW_KNOWLEDGE_BASE && (
            <li
              className={`menu_item ${location.pathname.startsWith("/file_explorer") ? "menu_item--active" : ""}`}
              onClick={() => {
                closeMobileDrawer();
                navigate("/file_explorer");
              }}
            >
              <FontAwesomeIcon icon={faDatabase} className="menu_icon" />
              <span>Knowledge base</span>
            </li>
          )}
          <li
            className={`menu_item ${(location.pathname.startsWith("/agents") || location.pathname.startsWith("/native-agents")) ? "menu_item--active" : ""}`}
            onClick={() => {
              closeMobileDrawer();
              navigate("/agents");
            }}
          >
            <FontAwesomeIcon icon={faRobot} className="menu_icon" />
            <span>Agents</span>
          </li>
          {isDesktop && (
            <li
              className={`menu_item ${location.pathname.startsWith("/local-knowledge") ? "menu_item--active" : ""}`}
              onClick={() => {
                closeMobileDrawer();
                navigate("/local-knowledge");
              }}
            >
              <FontAwesomeIcon icon={faFolderOpen} className="menu_icon" />
              <span>Local knowledge</span>
            </li>
          )}
          <li
            className="menu_item menu_item--more"
            role="button"
            tabIndex={0}
            aria-expanded={showMore}
            aria-controls="sidebar_more_items"
            title={showMore ? "Show less" : "More"}
            onClick={toggleMore}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMore(); } }}
          >
            <FontAwesomeIcon icon={faChevronDown} className={`menu_icon menu_more_chevron ${showMore ? "is_open" : ""}`} />
            <span>{showMore ? "Less" : "More"}</span>
          </li>
          <li className={`menu_more ${showMore ? "is_open" : ""}`} id="sidebar_more_items" aria-hidden={!showMore}>
            <ul>
              <li className="menu_group_label" aria-hidden="true">Build</li>
              <li
                className={`menu_item ${location.pathname.startsWith("/studio") ? "menu_item--active" : ""}`}
                tabIndex={showMore ? undefined : -1}
                onClick={() => {
                  closeMobileDrawer();
                  navigate("/studio");
                }}
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} className="menu_icon" />
                <span>Agent Studio</span>
              </li>
              <li
                className={`menu_item ${location.pathname.startsWith("/pipelines") ? "menu_item--active" : ""}`}
                tabIndex={showMore ? undefined : -1}
                onClick={() => {
                  closeMobileDrawer();
                  navigate("/pipelines");
                }}
              >
                <FontAwesomeIcon icon={faDiagramProject} className="menu_icon" />
                <span>Workflows</span>
              </li>
              {SHOW_SKILLS && (
                <li
                  className={`menu_item ${location.pathname.startsWith("/skills") ? "menu_item--active" : ""}`}
                  tabIndex={showMore ? undefined : -1}
                  onClick={() => {
                    closeMobileDrawer();
                    navigate("/skills");
                  }}
                >
                  <FontAwesomeIcon icon={faBookOpen} className="menu_icon" />
                  <span>Skills</span>
                </li>
              )}
              {SHOW_MARKETPLACE && (
                <li
                  className={`menu_item ${location.pathname.startsWith("/models") ? "menu_item--active" : ""}`}
                  tabIndex={showMore ? undefined : -1}
                  onClick={() => {
                    closeMobileDrawer();
                    navigate("/models");
                  }}
                >
                  <FontAwesomeIcon icon={faCubes} className="menu_icon" />
                  <span>Models</span>
                </li>
              )}
              {SERVER_FEATURES && (
                <>
              <li className="menu_group_label" aria-hidden="true">Connect</li>
              <li
                className={`menu_item ${location.pathname.startsWith("/reminders") ? "menu_item--active" : ""}`}
                tabIndex={showMore ? undefined : -1}
                onClick={() => {
                  closeMobileDrawer();
                  navigate("/reminders");
                }}
              >
                <FontAwesomeIcon icon={faBell} className="menu_icon" />
                <span>Reminders & alerts</span>
                <UnreadAlertsBadge />
              </li>
              <li
                className="menu_item"
                tabIndex={showMore ? undefined : -1}
                onClick={() => {
                  closeMobileDrawer();
                  setWhatsAppOpen(true);
                }}
              >
                <FontAwesomeIcon icon={faWhatsapp} className="menu_icon menu_icon--whatsapp" />
                <span>Connect WhatsApp</span>
              </li>
              <li
                className="menu_item"
                tabIndex={showMore ? undefined : -1}
                onClick={() => {
                  closeMobileDrawer();
                  setTelegramOpen(true);
                }}
              >
                <FontAwesomeIcon icon={faTelegram} className="menu_icon menu_icon--telegram" />
                <span>Connect Telegram</span>
              </li>
                </>
              )}
            </ul>
          </li>
        </ul>

        {/* ─── Chat History ────────────────────────────── */}
        {/* Kept mounted while collapsed (hidden via CSS) so expanding doesn't
            drop a full list into a still-narrow sidebar. */}
        <div className="sidebar_chat_section" aria-hidden={!expanded}>
            {pinError && <div className="chat_pin_error" role="alert">{pinError}</div>}
            {pinnedSessions.length > 0 && (
              <>
                <div className="chat_section_label chat_section_label--pinned"><Pin size={11} /> Pinned</div>
                {pinnedSessions.map((session) => renderRow(session, true))}
              </>
            )}
            <div className="chat_section_label">Recents</div>
            {!sessionsLoaded ? (
              <div className="chat_skeleton" role="status" aria-label="Loading chats">
                {SKELETON_WIDTHS.map((w, i) => (
                  <div key={i} className="chat_skeleton_row" style={{ animationDelay: `${i * 0.08}s` }}>
                    <span className="chat_skeleton_bar" style={{ width: `${w}%` }} />
                    <span className="chat_skeleton_time" />
                  </div>
                ))}
              </div>
            ) : sessionsStatus === "error" && sessions.length === 0 ? (
              <div className="chat_list_note">
                Couldn't load your chats.{" "}
                <button type="button" className="chat_list_link" onClick={() => dispatch(loadSessions())}>Retry</button>
              </div>
            ) : unpinnedSessions.length === 0 ? (
              <div className="chat_list_note">No chats yet</div>
            ) : (
              <>
                {visibleRecents.map((session) => renderRow(session, false))}
                {activeOlderChat && renderRow(activeOlderChat, false)}
                {hiddenRecents > 0 && (
                  <button type="button" className="chat_view_all" onClick={() => { closeMobileDrawer(); navigate("/search"); }}>
                    <Search size={13} />
                    <span>View all chats</span>
                    <span className="chat_view_all_count">{unpinnedSessions.length}</span>
                  </button>
                )}
              </>
            )}
        </div>

        {showSideBar && (
          <div
            className="sidebar_resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SB_MIN}
            aria-valuemax={SB_MAX}
            aria-valuenow={sbWidth}
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={() => setWidth(SB_DEFAULT)}
            onKeyDown={resizeKeys}
          />
        )}

        {/* ─── Bottom ──────────────────────────────────── */}
        <div className="sidebar_bottom_section" ref={accountRef}>
          {accountOpen && (
            <div className="account_menu" role="menu" aria-label="Account"
              style={menuPos ? { left: menuPos.left, bottom: menuPos.bottom, width: menuPos.width } : undefined}>
              <div className="account_menu__email">{auth.currentUser?.email ?? auth.currentUser?.phoneNumber ?? "Signed in"}</div>
              <div className="account_menu__theme" role="radiogroup" aria-label="Theme">
                <button type="button" role="radio" aria-checked={themeMode === "light"} className={themeMode === "light" ? "is_active" : ""} onClick={() => setThemePref(lightPref)}>
                  <FontAwesomeIcon icon={faSun} /> Light
                </button>
                <button type="button" role="radio" aria-checked={themeMode === "dark"} className={themeMode === "dark" ? "is_active" : ""} onClick={() => setThemePref("dark")}>
                  <FontAwesomeIcon icon={faMoon} /> Dark
                </button>
                <button type="button" role="radio" aria-checked={themeMode === "system"} className={themeMode === "system" ? "is_active" : ""} onClick={() => setThemePref("system")}>
                  <FontAwesomeIcon icon={faDesktop} /> Auto
                </button>
              </div>
              <div className="account_menu__sep" />
              <div className="account_menu__label">Account</div>
              <button type="button" role="menuitem" className={location.pathname === "/usage" ? "is_active" : ""} onClick={() => goFromMenu("/usage")}>
                <FontAwesomeIcon icon={faChartColumn} className="account_menu__icon" /> Usage
              </button>
              {SERVER_FEATURES && (
                <button type="button" role="menuitem" className={location.pathname === "/billing" ? "is_active" : ""} onClick={() => goFromMenu("/billing")}>
                  <FontAwesomeIcon icon={faCreditCard} className="account_menu__icon" /> Plan & billing
                  {planName && <span className="account_menu__hint">{planName}</span>}
                </button>
              )}
              {SHOW_MARKETPLACE && (
                <button type="button" role="menuitem" className={location.pathname === "/credits" ? "is_active" : ""} onClick={() => goFromMenu("/credits")}>
                  <FontAwesomeIcon icon={faWallet} className="account_menu__icon" /> Credits
                </button>
              )}
              <div className="account_menu__sep" />
              <div className="account_menu__label">Settings</div>
              {SERVER_FEATURES && (
                <button type="button" role="menuitem" className={location.pathname === "/settings/keys" ? "is_active" : ""} onClick={() => goFromMenu("/settings/keys")}>
                  <FontAwesomeIcon icon={faKey} className="account_menu__icon" /> API keys
                </button>
              )}
              {SHOW_MARKETPLACE && (
                <button type="button" role="menuitem" className={location.pathname === "/developer" ? "is_active" : ""} onClick={() => goFromMenu("/developer")}>
                  <FontAwesomeIcon icon={faCode} className="account_menu__icon" /> Developer API
                </button>
              )}
              {SERVER_FEATURES && (
                <>
                  <button type="button" role="menuitem" className={location.pathname === "/settings/memory" ? "is_active" : ""} onClick={() => goFromMenu("/settings/memory")}>
                    <FontAwesomeIcon icon={faBrain} className="account_menu__icon" /> Memory
                  </button>
                  <button type="button" role="menuitem" className={location.pathname === "/settings/documents" ? "is_active" : ""} onClick={() => goFromMenu("/settings/documents")}>
                    <FontAwesomeIcon icon={faFileWord} className="account_menu__icon" /> Document style
                  </button>
                  <button type="button" role="menuitem" className={location.pathname === "/settings/workspace" ? "is_active" : ""} onClick={() => goFromMenu("/settings/workspace")}>
                    <FontAwesomeIcon icon={faUsers} className="account_menu__icon" /> Team workspace
                  </button>
                </>
              )}
              <button type="button" role="menuitem" className={location.pathname === "/settings/appearance" ? "is_active" : ""} onClick={() => goFromMenu("/settings/appearance")}>
                <FontAwesomeIcon icon={faPalette} className="account_menu__icon" /> Appearance
              </button>
              {isOwner && (
                <>
                  <div className="account_menu__sep" />
                  <div className="account_menu__label">Admin</div>
                </>
              )}
              {isOwner && (
                <button type="button" role="menuitem" className={location.pathname === "/settings/server" ? "is_active" : ""} onClick={() => goFromMenu("/settings/server")}>
                  <FontAwesomeIcon icon={faSliders} className="account_menu__icon" /> Server settings
                </button>
              )}
              {isOwner && (
                <button type="button" role="menuitem" className={location.pathname === "/admin/earnings" ? "is_active" : ""} onClick={() => goFromMenu("/admin/earnings")}>
                  <FontAwesomeIcon icon={faSackDollar} className="account_menu__icon" /> Earnings
                </button>
              )}
              {SHOW_MARKETPLACE && isOwner && (
                <button type="button" role="menuitem" className={location.pathname === "/admin/catalog" ? "is_active" : ""} onClick={() => goFromMenu("/admin/catalog")}>
                  <FontAwesomeIcon icon={faLayerGroup} className="account_menu__icon" /> Model catalogue
                </button>
              )}
              {SERVER_FEATURES && (
                <>
                  <div className="account_menu__sep" />
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); void handleLogout(); }}>
                    <FontAwesomeIcon icon={faRightFromBracket} className="account_menu__icon" /> Log out
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); void handleLogout(true); }}>
                    <FontAwesomeIcon icon={faRightFromBracket} className="account_menu__icon" /> Log out of all devices
                  </button>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            className={`sidebar_user_profile ${accountOpen ? "is_open" : ""}`}
            onClick={(e) => toggleAccount(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            title="Account"
          >
            <span className="user_avatar">
              {auth.currentUser?.displayName
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "?"}
            </span>
            {expanded && (
              <span className="user_info">
                <span className="user_name">{auth.currentUser?.displayName}</span>
                <span className="user_plan">{planName ? `${planName} plan` : " "}</span>
              </span>
            )}
          </button>
        </div>
      </div>
      {whatsAppOpen && <WhatsAppConnect mode="connect" onClose={() => setWhatsAppOpen(false)} />}
      {telegramOpen && <TelegramConnect onClose={() => setTelegramOpen(false)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          message="The chat and all its messages are deleted for good. This can't be undone."
          confirmLabel="Delete chat"
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
};
