import { useState } from "react";
import { describeToolUse } from "@/features/chat/lib/tool_usage";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

export interface ToolCallCardProps {
  name: string;
  args?: string;
  result?: string;
  done: boolean;
  source: "function" | "mcp";
  serverLabel?: string;
}

// Args/results arrive as raw JSON strings — pretty-print them when they
// parse cleanly (almost always) so the collapsed detail view reads like a
// small code block instead of one dense unbroken line.
function prettyPrint(raw?: string): string | undefined {
  if (!raw) return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const MAX_RESULT_CHARS = 800;

const KIND_TITLE: Record<string, string> = { skill: "Skill", skill_file: "Reading skill file", function: "Function", mcp: "", agent: "Asking", tool: "" };
// "load_skill" → "Skill · maximo-fdd-writer", "jira__getjiraissue" → "getjiraissue" (MCP badge says the server).
function friendlyTitle(name: string, args?: string, serverLabel?: string): string {
  const u = describeToolUse(name, args, serverLabel);
  if (!u) return name;
  const kind = KIND_TITLE[u.kind];
  return kind ? `${kind} · ${u.label}` : u.label;
}

const ICON_BY_STATE: Record<string, string> = {
  done: "ti-check",
  mcp: "ti-plug",
  function: "ti-math-function",
};

// Previously the card dumped the raw args string and raw result string
// concatenated on one line, always visible, with no way to hide it — for
// tools like search_knowledge_base that return a few KB of JSON, that
// meant a wall of unformatted text sitting permanently in the chat. This
// mirrors CodeInterpreterCard's pattern instead: a compact header that's
// all you see by default, with the raw detail tucked behind a chevron for
// whenever someone actually wants to inspect it.
// "ask_jira_agent" → "Jira Agent" (until the answer names it).
const helperName = (tool: string) => tool.replace(/^ask_/, "").replace(/_\d+$/, "").split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const parse = (raw?: string): Record<string, unknown> | null => {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
};

// An agent asking another agent: who was asked, the task, and the answer
// (rendered as Markdown) — not raw JSON.
const HelperCallCard = ({ name, args, result, done }: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const a = parse(args);
  const r = parse(result);
  const agent = typeof r?.agent === "string" ? r.agent : helperName(name);
  const task = typeof a?.task === "string" ? a.task : "";
  const answer = typeof r?.answer === "string" ? r.answer : !r && result ? result : "";
  return (
    <div className={`tool-card helper-card ${done ? "done" : ""}`}>
      <button type="button" className="tool-card__header" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <div className={`tool-icon-wrap ${done ? "done" : ""}`}>
          <i className={`ti ${done ? "ti-check" : "ti-robot"}`} aria-hidden="true" />
        </div>
        <div className="tool-card__text">
          <div className="tool-card__title">
            <span className="tool-card__name">{done ? `Asked ${agent}` : `Asking ${agent}…`}</span>
            <span className="mcp-badge">Agent</span>
          </div>
          <div className="tool-card__status">
            <span className={`tool-status-dot ${done ? "done" : ""}`} />
            {done ? (task ? task.slice(0, 90) + (task.length > 90 ? "…" : "") : "Answered") : `${agent} is working on it…`}
          </div>
        </div>
        <span className="tool-card__chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="tool-card__body">
          {task && <><div className="helper-card__label">Task</div><pre className="tool-card__block"><code>{task}</code></pre></>}
          {answer && <><div className="helper-card__label">{agent}'s answer</div><MarkdownOutput text={answer} /></>}
          {!answer && done && result && <pre className="tool-card__block tool-card__block--result"><code>{result}</code></pre>}
        </div>
      )}
    </div>
  );
};

export const ToolCallCard = (props: ToolCallCardProps) => {
  if (props.source === "function" && props.name.startsWith("ask_")) return <HelperCallCard {...props} />;
  return <PlainToolCallCard {...props} />;
};

const PlainToolCallCard = ({ name, args, result, done, source, serverLabel }: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const prettyArgs = prettyPrint(args);
  const hasArgs = Boolean(prettyArgs && prettyArgs !== "{}");

  const prettyResultFull = done ? prettyPrint(result) : undefined;
  const prettyResult =
    prettyResultFull && prettyResultFull.length > MAX_RESULT_CHARS
      ? `${prettyResultFull.slice(0, MAX_RESULT_CHARS)}…`
      : prettyResultFull;
  const hasResult = Boolean(prettyResult);

  const hasBody = hasArgs || hasResult;
  const iconClass = done ? ICON_BY_STATE.done : ICON_BY_STATE[source];

  return (
    <div className={`tool-card ${done ? "done" : ""} ${source === "mcp" ? "mcp-tool" : ""}`}>
      <button
        type="button"
        className="tool-card__header"
        onClick={() => hasBody && setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!hasBody}
      >
        <div className={`tool-icon-wrap ${done ? "done" : ""}`}>
          <i className={`ti ${iconClass}`} aria-hidden="true" />
        </div>

        <div className="tool-card__text">
          <div className="tool-card__title">
            <span className="tool-card__name" title={name}>{friendlyTitle(name, args, serverLabel)}</span>
            {source === "mcp" && (
              <span className="mcp-badge">MCP{serverLabel ? ` · ${serverLabel}` : ""}</span>
            )}
          </div>
          <div className="tool-card__status">
            <span className={`tool-status-dot ${done ? "done" : ""}`} />
            {done ? "Done" : source === "mcp" ? "Calling remote server…" : "Running…"}
          </div>
        </div>

        {hasBody && <span className="tool-card__chevron">{expanded ? "▾" : "▸"}</span>}
      </button>

      {expanded && hasBody && (
        <div className="tool-card__body">
          {hasArgs && (
            <pre className="tool-card__block">
              <code>{prettyArgs}</code>
            </pre>
          )}
          {hasResult && (
            <pre className="tool-card__block tool-card__block--result">
              <code>{prettyResult}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
