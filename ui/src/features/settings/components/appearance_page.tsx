import { Check, Monitor } from "lucide-react";
import { THEMES, themeInfo, useTheme, type ThemeInfo, type ThemePref } from "@/shared/lib/theme";

// A miniature of the app (sidebar, page, a card, a button) in a theme's colours.
const Preview = ({ t }: { t: ThemeInfo["swatch"] }) => (
  <span className="ap_preview" style={{ background: t.bg }} aria-hidden="true">
    <span className="ap_preview__side" style={{ background: t.sidebar }}>
      <span style={{ background: t.text, opacity: 0.55 }} />
      <span style={{ background: t.text, opacity: 0.3 }} />
      <span style={{ background: t.text, opacity: 0.3 }} />
    </span>
    <span className="ap_preview__main">
      <span className="ap_preview__card" style={{ background: t.surface }}>
        <span style={{ background: t.text, opacity: 0.7, width: "70%" }} />
        <span style={{ background: t.text, opacity: 0.3, width: "90%" }} />
      </span>
      <span className="ap_preview__btn" style={{ background: t.accent }} />
    </span>
  </span>
);

const Card = ({ id, label, selected, onPick, children, hint }: {
  id: ThemePref; label: string; selected: boolean; onPick: (p: ThemePref) => void; children: React.ReactNode; hint?: string;
}) => (
  <button type="button" role="radio" aria-checked={selected} className={`ap_card ${selected ? "is_selected" : ""}`} onClick={() => onPick(id)}>
    {children}
    <span className="ap_card__label">
      {selected && <Check size={14} />} {label}
      {hint && <span className="ap_card__hint">{hint}</span>}
    </span>
  </button>
);

// Settings → Appearance: pick a theme (saved in this browser).
export const AppearancePage = () => {
  const { pref, theme, setPref } = useTheme();
  const sky = themeInfo("sky").swatch, dark = themeInfo("dark").swatch;

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Appearance</h1>
          <p className="ag_page__subtitle">Choose how Owl looks. Saved on this device.</p>
        </div>
      </header>

      <div className="ap_grid" role="radiogroup" aria-label="Theme">
        <Card id="system" label="System" selected={pref === "system"} onPick={setPref} hint={pref === "system" ? `Now: ${themeInfo(theme).label}` : "Light or dark, like your computer"}>
          <span className="ap_preview ap_preview--split" aria-hidden="true">
            <Preview t={sky} />
            <Preview t={dark} />
            <span className="ap_preview__badge"><Monitor size={14} /></span>
          </span>
        </Card>
        {THEMES.map((t) => (
          <Card key={t.id} id={t.id} label={t.label} selected={pref === t.id} onPick={setPref} hint={t.dark ? "Dark" : "Light"}>
            <Preview t={t.swatch} />
          </Card>
        ))}
      </div>
    </div>
  );
};
