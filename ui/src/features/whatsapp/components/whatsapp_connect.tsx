import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import type { WhatsAppLinkCode, WhatsAppStatus } from "@/shared/types";
import { api } from "@/features/chat/api/chat_api";
import { WhatsAppAwayPanel } from "@/features/whatsapp/components/whatsapp_away";

type WhatsAppConnectProps = {
  // "continue" moves this chat to the phone; "connect" just links the number.
  mode: "connect" | "continue";
  sessionId?: string | null;
  onClose: () => void;
};

type View =
  | { kind: "loading" }
  | { kind: "pair"; qr?: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "code"; code: WhatsAppLinkCode; qr: string }
  | { kind: "linked"; status: WhatsAppStatus; justLinked: boolean }
  | { kind: "continued"; waLink: string }
  | { kind: "error"; message: string };

const formatNumber = (n: string) => `+${n}`;

// Mount only while open (`{open && <WhatsAppConnect …/>}`).
export const WhatsAppConnect = ({ mode, sessionId, onClose }: WhatsAppConnectProps) => {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  // Bumped to re-run the initial check, e.g. once the bot finishes pairing.
  const [reloadKey, setReloadKey] = useState(0);

  // Initial load: decide which screen to show.
  useEffect(() => {
    let cancelled = false;
    const showCode = async () => {
      const code = await api.createWhatsAppLinkCode(mode === "continue" ? sessionId : null);
      const qr = await QRCode.toDataURL(code.waLink, { margin: 1, width: 220, color: { dark: "#18181b", light: "#ffffff" } });
      if (!cancelled) setView({ kind: "code", code, qr });
    };
    (async () => {
      try {
        const status = await api.getWhatsAppStatus();
        if (cancelled) return;
        if (!status.enabled) {
          return setView({ kind: "unavailable", reason: "WhatsApp is turned off. The app owner can turn it on in Server settings (account menu)." });
        }
        if (!status.botConnected) {
          if (!status.canPair) {
            return setView({ kind: "unavailable", reason: "The Owl WhatsApp number is offline right now. Ask your admin to reconnect it." });
          }
          await api.pairWhatsAppBot();
          if (!cancelled) setView({ kind: "pair" });
          return;
        }
        if (mode === "continue" && sessionId && status.link) {
          const { waLink } = await api.continueInWhatsApp(sessionId);
          window.open(waLink, "_blank", "noopener");
          if (!cancelled) setView({ kind: "continued", waLink });
          return;
        }
        if (status.link) return setView({ kind: "linked", status, justLinked: false });
        await showCode();
      } catch (err) {
        if (!cancelled) setView({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, sessionId, reloadKey]);

  // Pairing the bot: draw the server's QR (it rotates every ~20s) and move on
  // to linking the user's own number once the bot is online.
  useEffect(() => {
    if (view.kind !== "pair") return;
    let lastQr: string | undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.getWhatsAppStatus();
        if (cancelled) return;
        if (status.botConnected) return setReloadKey((k) => k + 1);
        if (status.botState === "logged_out" || status.botState === "disconnected") await api.pairWhatsAppBot();
        if (status.pairingQr && status.pairingQr !== lastQr) {
          lastQr = status.pairingQr;
          const qr = await QRCode.toDataURL(status.pairingQr, { margin: 1, width: 240, color: { dark: "#18181b", light: "#ffffff" } });
          if (!cancelled) setView({ kind: "pair", qr });
        }
      } catch {
        // transient — keep polling
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [view.kind]);

  // While a code is showing, watch for the phone to send it.
  useEffect(() => {
    if (view.kind !== "code") return;
    const poll = setInterval(async () => {
      try {
        const status = await api.getWhatsAppStatus();
        if (status.link) setView({ kind: "linked", status, justLinked: true });
      } catch {
        // transient — keep polling
      }
    }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [view.kind]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const unlink = async () => {
    try {
      await api.unlinkWhatsApp();
      onClose();
    } catch (err) {
      setView({ kind: "error", message: err instanceof Error ? err.message : "Couldn't unlink" });
    }
  };

  const secondsLeft = view.kind === "code" ? Math.max(0, Math.round((new Date(view.code.expiresAt).getTime() - now) / 1000)) : 0;
  const title = mode === "continue" ? "Continue in WhatsApp" : "Connect WhatsApp";

  return createPortal(
    <div className="doc_picker__backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wa_modal" role="dialog" aria-modal="true" aria-labelledby="wa_modal_title">
        <div className="doc_picker__header">
          <div className="wa_modal__heading">
            <span className="wa_modal__badge"><FontAwesomeIcon icon={faWhatsapp} /></span>
            <h3 id="wa_modal_title" className="doc_picker__title">{title}</h3>
          </div>
          <button type="button" className="composer_icon_btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="wa_modal__body">
          {view.kind === "loading" && (
            <div className="doc_picker__empty"><LoaderCircle size={18} className="spin" /> Checking WhatsApp…</div>
          )}

          {view.kind === "pair" && (
            <>
              <p className="wa_modal__lead">
                First, connect the phone number that Owl will use. This is a one-time setup.
              </p>
              <div className="wa_modal__qr_row">
                {view.qr ? (
                  <img src={view.qr} alt="QR code to link the bot's WhatsApp number" className="wa_modal__qr" />
                ) : (
                  <div className="wa_modal__qr wa_modal__qr--loading"><LoaderCircle size={22} className="spin" /></div>
                )}
                <ol className="wa_modal__steps">
                  <li>On the <strong>bot's phone</strong>, open WhatsApp.</li>
                  <li>Go to <strong>Settings → Linked devices → Link a device</strong>.</li>
                  <li>Point the camera at this code.</li>
                </ol>
              </div>
              <p className="wa_modal__note">
                The number you scan with becomes the bot. Use a spare number — WhatsApp may block numbers that run bots.
              </p>
              <div className="wa_modal__waiting">
                <LoaderCircle size={14} className="spin" />
                {view.qr ? "Waiting for the scan… the code refreshes automatically." : "Getting a code from WhatsApp…"}
              </div>
            </>
          )}

          {(view.kind === "unavailable" || view.kind === "error") && (
            <p className={`wa_modal__note ${view.kind === "error" ? "wa_modal__note--error" : ""}`}>
              {view.kind === "unavailable" ? view.reason : view.message}
            </p>
          )}

          {view.kind === "code" && (
            <>
              <p className="wa_modal__lead">
                {mode === "continue"
                  ? "Link your number once and this chat will continue on your phone."
                  : "Chat with Owl from your phone — with your documents and chat history."}
              </p>
              <div className="wa_modal__qr_row">
                <img src={view.qr} alt="QR code that opens WhatsApp with your link code" className="wa_modal__qr" />
                <ol className="wa_modal__steps">
                  <li>Scan the code with your phone's camera, or use the button below.</li>
                  <li>WhatsApp opens with your code already typed.</li>
                  <li>Press <strong>send</strong> — that's it.</li>
                </ol>
              </div>
              <a className="wa_modal__primary" href={view.code.waLink} target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faWhatsapp} /> Open WhatsApp
              </a>
              <div className="wa_modal__code_line">
                <span>Or send this to <strong>{formatNumber(view.code.botNumber)}</strong>:</span>
                <code className="wa_modal__code">link {view.code.code}</code>
              </div>
              <div className="wa_modal__waiting">
                <LoaderCircle size={14} className="spin" />
                {secondsLeft > 0
                  ? `Waiting for your message… code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                  : "This code has expired — close and try again."}
              </div>
            </>
          )}

          {view.kind === "linked" && view.status.link && (
            <>
              <div className="wa_modal__success">
                <span className="wa_modal__check"><Check size={18} /></span>
                <div>
                  <strong>{view.justLinked ? "WhatsApp connected" : "WhatsApp is connected"}</strong>
                  <span>
                    {formatNumber(view.status.link.number)}
                    {view.status.link.displayName ? ` · ${view.status.link.displayName}` : ""}
                  </span>
                </div>
              </div>
              <p className="wa_modal__lead">
                Message the Owl number any time. Your WhatsApp chats also appear here in the sidebar.
                Send <code>/help</code> in WhatsApp to see what it can do.
              </p>
              {view.status.botNumber && (
                <a className="wa_modal__primary" href={`https://wa.me/${view.status.botNumber}`} target="_blank" rel="noopener noreferrer">
                  <FontAwesomeIcon icon={faWhatsapp} /> Open WhatsApp
                </a>
              )}
              {view.status.awayAvailable && <WhatsAppAwayPanel />}
              {!view.justLinked && (
                <button type="button" className="wa_modal__secondary" onClick={unlink}>Unlink this number</button>
              )}
            </>
          )}

          {view.kind === "continued" && (
            <>
              <div className="wa_modal__success">
                <span className="wa_modal__check"><Check size={18} /></span>
                <div>
                  <strong>Moved to WhatsApp</strong>
                  <span>Your next WhatsApp message continues this chat.</span>
                </div>
              </div>
              <a className="wa_modal__primary" href={view.waLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Open WhatsApp again
              </a>
            </>
          )}
        </div>
      </div>
    </div>,
    document.getElementById("modal-root") ?? document.body
  );
};
