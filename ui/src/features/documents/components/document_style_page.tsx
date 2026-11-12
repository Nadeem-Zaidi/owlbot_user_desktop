import { useEffect, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { Button, ErrorNote, Field } from "@/shared/ui/ui";
import { documentsApi, type DocumentStyle } from "@/features/documents/api/documents_api";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SWATCHES = ["#2A74A8", "#1F3A93", "#0F766E", "#B91C1C", "#7C3AED", "#C2410C", "#111827"];

// Branding for the Word and Excel files the assistant creates — any kind of
// document or spreadsheet: company name, logo (Word header), brand colour
// (headings, table/sheet headers), font, footer text and currency (Excel).
// The assistant leaves branding off when a file shouldn't carry it (a resume,
// a personal letter) or when the user asks.
export const DocumentStylePage = () => {
  const [style, setStyle] = useState<DocumentStyle | null>(null);
  const [form, setForm] = useState<DocumentStyle | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    documentsApi.style().then((s) => { setStyle(s); setForm(s); if (s.hasLogo) void documentsApi.logoUrl().then(setLogoUrl).catch(() => {}); })
      .catch((e) => setError(errorText(e)));
  }, []);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try { await task(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  const save = () => run("save", async () => {
    if (!form) return;
    const s = await documentsApi.saveStyle({ company: form.company, color: form.color, font: form.font, footer: form.footer, currency: form.currency });
    setStyle({ ...s, fonts: style?.fonts });
    setForm({ ...s, fonts: style?.fonts });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run("logo", async () => {
      if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Choose a PNG or JPEG image");
      if (file.size > 500_000) throw new Error("The logo must be under 500 KB");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Couldn't read the image"));
        reader.readAsDataURL(file);
      });
      await documentsApi.saveLogo(dataUrl);
      setLogoUrl(dataUrl);
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  if (!form) {
    return (
      <div className="ag_page st_page">
        <h1 className="ag_page__title">Document style</h1>
        {error ? <ErrorNote message={error} /> : <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>}
      </div>
    );
  }
  const set = <K extends keyof DocumentStyle>(k: K, v: DocumentStyle[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = JSON.stringify({ ...form, fonts: undefined, hasLogo: undefined }) !== JSON.stringify({ ...style, fonts: undefined, hasLogo: undefined });

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Document style</h1>
          <p className="ag_page__subtitle">
            Your branding for any Word or Excel file the assistant creates — reports, letters, proposals, invoices, trackers, budgets, anything you ask for.
            For files that shouldn't carry it (a resume, a personal letter), just say "without branding".
          </p>
        </div>
      </header>
      <ErrorNote message={error} />

      <div className="ds_layout">
        <section className="ag_section ds_form">
          <Field label="Company name" hint="Shown in the Word header, next to your logo.">
            <input className="ag_input" value={form.company} maxLength={120} placeholder="Acme Pvt Ltd" onChange={(e) => set("company", e.target.value)} />
          </Field>

          <div className="ag_field">
            <span className="ag_field__label">Logo</span>
            <div className="ds_logo">
              {logoUrl ? <img src={logoUrl} alt="Company logo" /> : <span className="ag_muted ag_small">No logo</span>}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload(e.target.files?.[0])} />
              <Button onClick={() => fileInput.current?.click()} busy={busy === "logo"}><ImageUp size={14} /> {logoUrl ? "Replace" : "Upload"}</Button>
              {logoUrl && (
                <Button variant="ghost" onClick={() => void run("rmlogo", async () => { await documentsApi.removeLogo(); setLogoUrl(null); })}>
                  <Trash2 size={14} /> Remove
                </Button>
              )}
            </div>
            <span className="ag_field__hint">PNG or JPEG, under 500 KB.</span>
          </div>

          <div className="ag_field">
            <span className="ag_field__label">Brand colour</span>
            <div className="ds_colors">
              {SWATCHES.map((c) => (
                <button key={c} type="button" className={`ds_swatch ${form.color.toUpperCase() === c ? "is_on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => set("color", c)} />
              ))}
              <input type="color" className="ds_picker" value={form.color} aria-label="Custom colour" onChange={(e) => set("color", e.target.value.toUpperCase())} />
              <code>{form.color}</code>
            </div>
          </div>

          <div className="ds_row">
            <Field label="Font">
              <select className="ag_input" value={form.font} onChange={(e) => set("font", e.target.value)}>
                {(style?.fonts ?? [form.font]).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Currency (Excel)">
              <input className="ag_input" value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value)} />
            </Field>
          </div>

          <Field label="Footer text" hint="E.g. Confidential · Acme Pvt Ltd. Page numbers are added automatically.">
            <input className="ag_input" value={form.footer} maxLength={200} onChange={(e) => set("footer", e.target.value)} />
          </Field>

          <div className="ds_actions">
            <Button variant="primary" onClick={() => void save()} busy={busy === "save"} disabled={!dirty}>{saved ? "Saved" : "Save style"}</Button>
          </div>
        </section>

        <aside className="ds_preview" aria-label="Preview" style={{ fontFamily: form.font }}>
          <div className="ds_page">
            <div className="ds_page__header">
              {logoUrl && <img src={logoUrl} alt="" />}
              <strong style={{ color: form.color }}>{form.company || "Your company"}</strong>
            </div>
            <h2 style={{ color: form.color }}>Your document title</h2>
            <h3 style={{ color: form.color }}>1. Section heading</h3>
            <p>Any content you ask for — a report, letter, proposal, notes or plan — written in your font and colours.</p>
            <table>
              <thead><tr><th style={{ background: `${form.color}26` }}>Item</th><th style={{ background: `${form.color}26` }}>Status</th></tr></thead>
              <tbody><tr><td>Website launch</td><td>Done</td></tr></tbody>
            </table>
            <div className="ds_page__footer">{form.footer ? `${form.footer} · ` : ""}Page 1</div>
          </div>
          <div className="ds_sheet">
            <div className="ds_sheet__row ds_sheet__head" style={{ background: form.color }}><span>Item</span><span>Owner</span><span>Amount</span></div>
            <div className="ds_sheet__row"><span>Supplies</span><span>Priya</span><span>{form.currency}1,200.00</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
};
