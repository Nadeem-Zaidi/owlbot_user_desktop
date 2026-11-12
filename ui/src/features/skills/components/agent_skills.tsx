import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { skillsApi, type SkillSummary } from "@/features/skills/api/skills_api";

export type SkillMode = "all" | "selected" | "none";

// Agent editor → which of your skills this agent may load.
export const AgentSkillsSection = ({ mode, ids, onChange }: { mode: SkillMode; ids: string[]; onChange: (mode: SkillMode, ids: string[]) => void }) => {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  useEffect(() => { skillsApi.list().then(setSkills).catch(() => setSkills([])); }, []);
  const enabled = skills?.filter((s) => s.enabled) ?? [];
  const toggle = (id: string, on: boolean) => onChange("selected", on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));

  return (
    <section className="ag_section">
      <h2 className="ag_section__title">Skills</h2>
      <p className="ag_muted ag_small">
        Reusable instructions from your <Link to="/skills">skill library</Link>. The agent reads one only when a request matches it.
      </p>
      <div className="sk_modes" role="radiogroup" aria-label="Skills this agent may use">
        {([["all", "All my skills"], ["selected", "Only these"], ["none", "None"]] as const).map(([m, label]) => (
          <label key={m} className={`sk_mode ${mode === m ? "is_on" : ""}`}>
            <input type="radio" name="skill_mode" checked={mode === m} onChange={() => onChange(m, ids)} />
            {label}
          </label>
        ))}
      </div>
      {mode === "selected" && (
        skills === null ? null : enabled.length === 0 ? (
          <p className="ag_muted ag_small">You don't have any skills yet — <Link to="/skills">create one</Link>.</p>
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
    </section>
  );
};
