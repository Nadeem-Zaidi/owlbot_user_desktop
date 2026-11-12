import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { skillsApi, type SkillSummary } from "@/features/skills/api/skills_api";
import { Button } from "@/shared/ui/ui";

export type SkillMode = "all" | "selected" | "none";

// File → base64 (for a skill folder as .zip).
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error(`Couldn't read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

// Agent editor → which of your skills this agent may load, and adding new
// ones (a SKILL.md, or a skill folder as .zip) straight to this agent.
export const AgentSkillsSection = ({ mode, ids, onChange }: { mode: SkillMode; ids: string[]; onChange: (mode: SkillMode, ids: string[]) => void }) => {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reload = () => skillsApi.list().then(setSkills).catch(() => setSkills([]));
  useEffect(() => { void reload(); }, []);
  const enabled = skills?.filter((s) => s.enabled) ?? [];
  const toggle = (id: string, on: boolean) => onChange("selected", on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));

  const upload = async (files: File[]) => {
    setError(null);
    setBusy(true);
    const added: string[] = [];
    const problems: string[] = [];
    for (const f of files) {
      try {
        const s = /\.zip$/i.test(f.name)
          ? await skillsApi.importZip(await toBase64(f), f.name)
          : await skillsApi.importMarkdown(await f.text(), f.name);
        added.push(s.id);
      } catch (e) {
        problems.push(`${f.name}: ${e instanceof Error ? e.message : "couldn't import"}`);
      }
    }
    await reload();
    setBusy(false);
    if (problems.length) setError(problems.join("\n"));
    // "All my skills" already includes new ones; otherwise pick them for this agent.
    if (added.length && mode !== "all") onChange("selected", [...new Set([...(mode === "selected" ? ids : []), ...added])]);
  };

  return (
    <section className="ag_section">
      <div className="ag_section__head">
        <div>
          <h2 className="ag_section__title">Skills</h2>
          <p className="ag_muted ag_small">
            Reusable instructions (SKILL.md) from your <Link to="/skills">skill library</Link>. The agent sees each skill's name and description, and reads the full skill only when a request matches it.
          </p>
        </div>
        <Button onClick={() => input.current?.click()} busy={busy} title="A SKILL.md, or a whole skill folder as a .zip">
          <Upload size={15} /> Upload SKILL.md
        </Button>
        <input ref={input} type="file" hidden multiple accept=".md,.markdown,.txt,.zip" onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      <div className="sk_modes" role="radiogroup" aria-label="Skills this agent may use">
        {([["all", "All my skills"], ["selected", "Only these"], ["none", "None"]] as const).map(([m, label]) => (
          <label key={m} className={`sk_mode ${mode === m ? "is_on" : ""}`}>
            <input type="radio" name="skill_mode" checked={mode === m} onChange={() => onChange(m, ids)} />
            {label}
          </label>
        ))}
      </div>
      {mode === "all" && skills && (
        <p className="ag_muted ag_small">
          {enabled.length ? `${enabled.length} skill${enabled.length === 1 ? "" : "s"}: ${enabled.map((s) => s.name).join(", ")}` : "You don't have any skills yet — upload a SKILL.md."}
        </p>
      )}
      {mode === "selected" && (
        skills === null ? null : enabled.length === 0 ? (
          <p className="ag_muted ag_small">You don't have any skills yet — upload a SKILL.md above, or <Link to="/skills">create one</Link>.</p>
        ) : (
          <div className="sk_pick">
            {enabled.map((s) => (
              <label key={s.id} className="sk_pick__item">
                <input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                <span><code>{s.name}</code> <span className="ag_muted ag_small">{s.description}</span></span>
              </label>
            ))}
          </div>
        )
      )}
      {error && <div className="ag_error" style={{ whiteSpace: "pre-line" }}>{error}</div>}
    </section>
  );
};
