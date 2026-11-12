import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTelegram } from "@fortawesome/free-brands-svg-icons";
import { Check, LoaderCircle, X } from "lucide-react";
import { telegramApi, type TelegramLinkCode, type TelegramStatus } from "@/features/telegram/api/telegram_api";

type View =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "code"; code: TelegramLinkCode; qr: string }
  | { kind: "linked"; status: TelegramStatus; justLinked: boolean }
  | { kind: "error"; message: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

// Link your Telegram to Owl: one tap on a t.me link opens the bot with a
// one-time code; pressing Start finishes it. Mount only while open.
export const TelegramConnect = ({ onClose }: { onClose: () => void }) => {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await telegramApi.status();
        if (cancelled) return;
        if (!status.enabled || !status.botUsername) {
          return setView({ kind: "unavailable", reason: "Telegram isn't set up on this server. The app owner can add a bot in Server settings (account menu)." });
        }
        if (status.link) return setView({ kind: "linked", status, justLinked: false });
        const code = await telegramApi.linkCode();
        const qr = await QRCode.toDataURL(code.deepLink, { margin: 1, width: 220, color: { dark: "#18181b", light: "#ffffff" } });
        if (!cancelled) setView({ kind: "code", code, qr });
      } catch (err) {
        if (!cancelled) setView({ kind: "error", message: errorText(err) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // While the code is showing, watch for the user to press Start in Telegram.
  useEffect(() => {
    if (view.kind !== "code") return;
    const poll = setInterval(async () => {
      try {
        const status = await telegramApi.status();
        if (status.link) setView({ kind: "linked", status, justLinked: true });
      } catch {
        // transient — keep polling
      }
    }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [view.kind]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const unlink = async () => {
    try {
      await telegramApi.unlink();
      onClose();
    } catch (err) {
      setView({ kind: "error", message: errorText(err) });
    }
  };

  const secondsLeft = view.kind === "code" ? Math.max(0, Math.round((new Date(view.code.expiresAt).getTime() - now) / 1000)) : 0;

  return createPortal(
    <div className="doc_picker__backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wa_modal tg_modal" role="dialog" aria-modal="true" aria-labelledby="tg_modal_title">
        <div className="doc_picker__header">
          <div className="wa_modal__heading">
            <span className="wa_modal__badge"><FontAwesomeIcon icon={faTelegram} /></span>
            <h3 id="tg_modal_title" className="doc_picker__title">Connect Telegram</h3>
          </div>
          <button type="button" className="composer_icon_btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="wa_modal__body">
          {view.kind === "loading" && <div className="doc_picker__empty"><LoaderCircle size={18} className="spin" /> Checking Telegram…</div>}

          {(view.kind === "unavailable" || view.kind === "error") && (
            <p className={`wa_modal__note ${view.kind === "error" ? "wa_modal__note--error" : ""}`}>
              {view.kind === "error" ? view.message : view.reason}
            </p>
          )}

          {view.kind === "code" && (
            <>
              <p className="wa_modal__lead">Chat with Owl from Telegram — with your documents, agents and memory.</p>
              <div className="wa_modal__qr_row">
                <img src={view.qr} alt="QR code that opens the Owl Telegram bot with your link code" className="wa_modal__qr" />
                <ol className="wa_modal__steps">
                  <li>Tap the button below, or scan the code with your phone.</li>
                  <li>Telegram opens the Owl bot.</li>
                  <li>Press <strong>Start</strong> — that's it.</li>
                </ol>
              </div>
              <a className="wa_modal__primary" href={view.code.deepLink} target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faTelegram} /> Open Telegram
              </a>
              <div className="wa_modal__code_line">
                <span>Or send this to <strong>@{view.code.botUsername}</strong>:</span>
                <code className="wa_modal__code">{view.code.code}</code>
              </div>
              <div className="wa_modal__waiting">
                <LoaderCircle size={14} className="spin" />
                {secondsLeft > 0
                  ? `Waiting for Telegram… code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                  : "This code has expired — close and try again."}
              </div>
            </>
          )}

          {view.kind === "linked" && view.status.link && (
            <>
              <div className="wa_modal__success">
                <span className="wa_modal__check"><Check size={18} /></span>
                <div>
                  <strong>{view.justLinked ? "Telegram connected" : "Telegram is connected"}</strong>
                  <span>{view.status.link.displayName ?? "Your Telegram account"}{view.status.botUsername ? ` · @${view.status.botUsername}` : ""}</span>
                </div>
              </div>
              <p className="wa_modal__lead">
                Message the bot any time. Your Telegram chats also appear here in the sidebar.
                Send <code>/help</code> in Telegram to see what it can do.
              </p>
              {view.status.botUsername && (
                <a className="wa_modal__primary" href={`https://t.me/${view.status.botUsername}`} target="_blank" rel="noopener noreferrer">
                  <FontAwesomeIcon icon={faTelegram} /> Open Telegram
                </a>
              )}
              {!view.justLinked && <button type="button" className="wa_modal__secondary" onClick={unlink}>Unlink Telegram</button>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.getElementById("modal-root") ?? document.body
  );
};
