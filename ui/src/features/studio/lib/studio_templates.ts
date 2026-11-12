import type { StudioCanvas, StudioEdge, StudioNode } from "@/features/studio/api/studio_api";
import { defaultTimezone } from "@/features/studio/lib/studio_graph";

// Starter projects. Each creates new agents on its first save.
export type StudioTemplate = {
  id: string;
  name: string;
  icon: string;
  description: string;
  deliver_result: boolean;
  build: () => StudioCanvas;
};

const X = 300;     // horizontal spacing
const SUB_Y = 190; // sub-nodes sit under their agent

const agent = (id: string, x: number, y: number, name: string, icon: string, instructions: string, instruction = "{{previous}}", description = ""): StudioNode =>
  ({ id, type: "agent", position: { x, y }, agent_id: null, instruction, agent: { name, icon, description, instructions } });
const tool = (id: string, x: number, y: number, t: string): StudioNode => ({ id, type: "tool", position: { x, y }, tool: t });
const plug = (from: string, to: string, port: StudioEdge["port"]): StudioEdge => ({ id: `${from}-${to}`, from, to, port });
const link = (from: string, to: string, branch?: StudioEdge["branch"]): StudioEdge => ({ id: `${from}-${branch ?? "out"}-${to}`, from, to, ...(branch ? { branch } : {}) });

export const TEMPLATES: StudioTemplate[] = [
  {
    id: "research-write-review",
    name: "Research → Write → Review",
    icon: "📝",
    description: "Three agents in a row: one gathers facts, one writes, one checks the draft.",
    deliver_result: false,
    build: () => ({
      version: 1,
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, trigger: { type: "manual" } },
        agent("researcher", X, 0, "Researcher", "🔎", "You research a topic thoroughly using the user's documents. Return the key facts as a bulleted list with the source of each.", "Research this topic: {{input}}"),
        tool("t_kb", X - 40, SUB_Y, "search_knowledge_base"),
        tool("t_dt", X + 50, SUB_Y, "current_datetime"),
        agent("writer", 2 * X, 0, "Writer", "✍️", "You turn research notes into a clear, well-structured article with headings. Keep it factual."),
        agent("reviewer", 3 * X, 0, "Reviewer", "🧐", "You review a draft for accuracy, clarity and tone. Return the improved final version only."),
        { id: "end", type: "end", position: { x: 4 * X, y: 0 }, output: "{{previous}}" },
      ],
      edges: [
        link("trigger", "researcher"), link("researcher", "writer"), link("writer", "reviewer"), link("reviewer", "end"),
        plug("t_kb", "researcher", "tools"), plug("t_dt", "researcher", "tools"),
      ],
    }),
  },
  {
    id: "support-triage",
    name: "Support triage",
    icon: "🎧",
    description: "A classifier reads each ticket and routes it to the billing, tech or general agent. Start it with /triage in WhatsApp or Telegram.",
    deliver_result: true,
    build: () => ({
      version: 1,
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 120 }, trigger: { type: "chat", command: "triage" } },
        agent("classifier", X, 120, "Ticket classifier", "🏷️",
          'Classify the support ticket. Reply ONLY with JSON: {"category": "billing" | "tech" | "other", "priority": "low" | "high", "summary": "<one line>"}',
          "Ticket: {{input}}"),
        { id: "router", type: "router", position: { x: 2 * X, y: 90 }, label: "By category", mode: "rule", source: "previous", routes: [
          { id: "billing", label: "Billing", when: { match: "all", rules: [{ field: "category", op: "equals", value: "billing" }] } },
          { id: "tech", label: "Tech", when: { match: "all", rules: [{ field: "category", op: "equals", value: "tech" }] } },
        ] },
        agent("billing_agent", 3 * X + 60, -60, "Billing support", "💳", "You answer billing questions (invoices, refunds, payments) politely and precisely.", "Customer ticket: {{input}}"),
        agent("tech_agent", 3 * X + 60, 120, "Tech support", "🛠️", "You troubleshoot technical problems step by step.", "Customer ticket: {{input}}"),
        agent("general_agent", 3 * X + 60, 300, "General support", "💬", "You answer general questions helpfully and briefly.", "Customer ticket: {{input}}"),
        { id: "end", type: "end", position: { x: 4 * X + 160, y: 120 }, output: "{{previous}}" },
      ],
      edges: [
        link("trigger", "classifier"), link("classifier", "router"),
        link("router", "billing_agent", "route:billing"), link("router", "tech_agent", "route:tech"), link("router", "general_agent", "default"),
        link("billing_agent", "end"), link("tech_agent", "end"), link("general_agent", "end"),
      ],
    }),
  },
  {
    id: "content-approval",
    name: "Draft with approval",
    icon: "✅",
    description: "An agent drafts, you approve or reject on your phone, then it's published (or revised).",
    deliver_result: false,
    build: () => ({
      version: 1,
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 60 }, trigger: { type: "manual" } },
        agent("drafter", X, 60, "Drafter", "📄", "You write a polished first draft of whatever is requested: an email, a post or a short report.", "Write: {{input}}"),
        { id: "approval", type: "approval", position: { x: 2 * X, y: 60 }, label: "Review the draft", message: "Approve this draft?\n\n{{previous}}", notify: true },
        { id: "notify", type: "notify", position: { x: 3 * X, y: -40 }, label: "Send it to me", message: "✅ Approved draft:\n\n{{node.drafter}}" },
        agent("reviser", 3 * X, 160, "Reviser", "🔁", "You rewrite a rejected draft. Make it shorter, clearer and more persuasive.", "Improve this draft: {{node.drafter}}"),
        { id: "end", type: "end", position: { x: 4 * X, y: 60 }, output: "{{previous}}" },
      ],
      edges: [
        link("trigger", "drafter"), link("drafter", "approval"),
        link("approval", "notify", "approved"), link("approval", "reviser", "rejected"),
        link("notify", "end"), link("reviser", "end"),
      ],
    }),
  },
  {
    id: "daily-briefing",
    name: "Weekday morning briefing",
    icon: "☀️",
    description: "Every weekday at 9:00 an agent reviews your documents and sends a short briefing to WhatsApp or Telegram.",
    deliver_result: true,
    build: () => ({
      version: 1,
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, trigger: { type: "schedule", timing: { frequency: "weekdays", time_of_day: "09:00", timezone: defaultTimezone() }, input: "Prepare today's briefing." } },
        agent("analyst", X, 0, "Briefing analyst", "📊", "You review the user's documents for deadlines, open items and anything that needs attention today.", "{{input}}"),
        tool("t_kb2", X - 40, SUB_Y, "search_knowledge_base"),
        tool("t_dt2", X + 50, SUB_Y, "current_datetime"),
        agent("summarizer", 2 * X, 0, "Briefing writer", "🗞️", "You write a crisp morning briefing: at most 6 bullet points, most urgent first."),
        { id: "end", type: "end", position: { x: 3 * X, y: 0 }, output: "{{previous}}" },
      ],
      edges: [
        link("trigger", "analyst"), link("analyst", "summarizer"), link("summarizer", "end"),
        plug("t_kb2", "analyst", "tools"), plug("t_dt2", "analyst", "tools"),
      ],
    }),
  },
];

export const blankCanvas = (): StudioCanvas => ({
  version: 1,
  nodes: [
    { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, trigger: { type: "manual" } },
    agent("agent_1", X, 0, "Agent", "🤖", ""),
    { id: "end", type: "end", position: { x: 2 * X, y: 0 }, output: "{{previous}}" },
  ],
  edges: [link("trigger", "agent_1"), link("agent_1", "end")],
});
