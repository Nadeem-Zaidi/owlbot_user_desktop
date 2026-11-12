import { BaseApi } from "@/shared/api/base_fetch";
import type { Branch, FlowNode, PipelineRun, Position } from "@/features/pipelines/api/pipelines_api";

// ── Agent Studio (backend core/studio/studio_types.ts) ──
export type Frequency = "hourly" | "daily" | "weekdays" | "weekly";
export type ScheduleTiming = { frequency: Frequency; interval_hours?: number | null; time_of_day?: string | null; weekday?: number | null; timezone: string };

export type TriggerConfig =
  | { type: "manual" }
  | { type: "schedule"; timing: ScheduleTiming; input: string }
  | { type: "webhook" }
  | { type: "chat"; command: string };
export type TriggerType = TriggerConfig["type"];

export type AgentDraft = { name: string; icon: string; description: string; instructions: string };
export type Port = "model" | "tools" | "knowledge" | "skills";
export type StudioStepNode = Extract<FlowNode, { type: "condition" | "router" | "approval" | "notify" | "end" }>;

export type StudioNode =
  | { id: string; type: "trigger"; position: Position; label?: string; trigger: TriggerConfig }
  | { id: string; type: "agent"; position: Position; label?: string; agent_id: string | null; instruction: string; agent: AgentDraft }
  | { id: string; type: "model"; position: Position; provider: string; model: string | null }
  | { id: string; type: "tool"; position: Position; tool: string }
  | { id: string; type: "knowledge"; position: Position; document_keys: string[] }
  | { id: string; type: "skill"; position: Position; skill_id: string }
  | StudioStepNode;
export type StudioNodeType = StudioNode["type"];
export type SubNode = Extract<StudioNode, { type: "model" | "tool" | "knowledge" | "skill" }>;
export type SubType = SubNode["type"];

export type StudioEdge = { id: string; from: string; to: string; branch?: Branch; port?: Port };
export type StudioCanvas = { version: 1; nodes: StudioNode[]; edges: StudioEdge[] };

export type StudioSummary = {
  id: string;
  name: string;
  description: string;
  pipeline_id: string | null;
  trigger_type: TriggerType;
  trigger_summary: string;
  chat_command: string | null;
  deliver_result: boolean;
  webhook_path: string | null;
  next_run_at: string | null;
  last_triggered_at: string | null;
  agents: { name: string; icon: string }[];
  last_run_status?: PipelineRun["status"] | null;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
};
export type StudioProject = StudioSummary & { canvas: StudioCanvas; runs: PipelineRun[] };
export type StudioInput = { name: string; description: string; deliver_result: boolean; canvas: StudioCanvas };

// Client for /api/studio (backend routes/studio_routes.ts). Runs are read,
// approved and cancelled through /api/pipelines/runs/… like Workflows.
class StudioApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  async list() { return (await this.get<{ projects: StudioSummary[] }>("/studio")).projects; }
  getProject(id: string) { return this.get<StudioProject>(`/studio/${id}`); }
  create(input: StudioInput) { return this.post<StudioProject>("/studio", input); }
  update(id: string, input: StudioInput) { return this.put<StudioProject>(`/studio/${id}`, input); }
  remove(id: string) { return this.delete<{ agents_kept: number }>(`/studio/${id}`); }
  run(id: string, input: string) { return this.post<PipelineRun>(`/studio/${id}/run`, { input }); }
  rotateWebhook(id: string) { return this.post<StudioProject>(`/studio/${id}/webhook/rotate`, {}); }
  // One agent with sample input, as set up on the canvas now (nothing saved).
  testStep(body: { node: StudioNode; subs: StudioNode[]; input: string }) {
    return this.post<{ output: string; error: string | null; prompt: string; duration_ms: number }>("/studio/test-step", body);
  }
}

export const studioApi = new StudioApi();

// The full webhook URL for a project ("/api/studio-hooks/…" from the server).
export function webhookUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base || window.location.origin}${path}`;
}
