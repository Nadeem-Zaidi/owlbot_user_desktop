import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";

// Small building blocks shared by the agent pages.

export const Modal = ({ title, subtitle, onClose, children, footer, wide }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="ag_backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ag_modal ${wide ? "ag_modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ag_modal__header">
          <div>
            <h3 className="ag_modal__title">{title}</h3>
            {subtitle && <p className="ag_modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="ag_icon_btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="ag_modal__body">{children}</div>
        {footer && <div className="ag_modal__footer">{footer}</div>}
      </div>
    </div>,
    document.getElementById("modal-root") ?? document.body
  );
};

export const Toggle = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled}
    className={`ag_switch ${checked ? "is_on" : ""}`}
    onClick={() => onChange(!checked)}
  >
    <span className="ag_switch__knob" />
  </button>
);

export const Button = ({ children, variant = "secondary", busy, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) => (
  <button type="button" {...rest} disabled={rest.disabled || busy} className={`ag_btn ag_btn--${variant} ${rest.className ?? ""}`}>
    {busy && <LoaderCircle size={15} className="spin" />}
    {children}
  </button>
);

export const ConfirmDialog = ({ title, message, confirmLabel, onConfirm, onCancel, busy }: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) => (
  <Modal
    title={title}
    onClose={onCancel}
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
      </>
    }
  >
    <p className="ag_muted">{message}</p>
  </Modal>
);

export const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <label className="ag_field">
    <span className="ag_field__label">{label}</span>
    {children}
    {hint && <span className="ag_field__hint">{hint}</span>}
  </label>
);

export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? <div className="ag_error" role="alert">{message}</div> : null;
