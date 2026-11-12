import { BookOpen, Bot, FileText, Plug, SquareFunction, Wrench } from "lucide-react";
import type { UsedItem, UsedKind } from "@/features/chat/lib/tool_usage";

const ICON: Record<UsedKind, React.ReactNode> = {
  skill: <BookOpen size={12} />,
  skill_file: <FileText size={12} />,
  function: <SquareFunction size={12} />,
  mcp: <Plug size={12} />,
  agent: <Bot size={12} />,
  tool: <Wrench size={12} />,
};

const KIND_LABEL: Record<UsedKind, string> = {
  skill: "Skill",
  skill_file: "Skill file",
  function: "Function",
  mcp: "MCP tool",
  agent: "Asked agent",
  tool: "Tool",
};

// "Used: Skill maximo-fdd-writer · templates/fdd.md · Function get_order …"
// under an answer, so you can see what it was based on.
export const UsedTools = ({ items }: { items: UsedItem[] }) => {
  if (!items.length) return null;
  return (
    <div className="used_tools" aria-label="What the assistant used">
      <span className="used_tools__label">Used</span>
      {items.map((u) => (
        <span key={`${u.kind}:${u.label}:${u.detail ?? ""}`} className={`used_chip used_chip--${u.kind}`}
          title={`${KIND_LABEL[u.kind]}: ${u.label}${u.detail ? ` (${u.kind === "skill_file" ? "from " : ""}${u.detail})` : ""}`}>
          {ICON[u.kind]}
          {u.kind === "skill" && <span className="used_chip__kind">Skill</span>}
          <span className="used_chip__name">{u.label}</span>
          {u.detail && u.kind === "mcp" && <span className="used_chip__detail">{u.detail}</span>}
        </span>
      ))}
    </div>
  );
};
