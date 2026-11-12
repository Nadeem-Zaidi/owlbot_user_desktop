import { BaseApi } from "@/shared/api/base_fetch";

// kind "native" = a provider agent (Claude / OpenAI); missing means a regular agent.
export type PipelineStep = { kind?: "agent" | "native"; agent_id: string; instruction: string };

// ── workflows (backend core/flows/flow_types.ts) ──
export type RuleOp =
  | "contains" | "not_contains" | "equals" | "matches" | "starts_with" | "ends_with" | "one_of"
  | "number_gt" | "number_gte" | "number_lt" | "number_lte" | "number_between"
  | "is_empty" | "not_empty" | "exists" | "not_exists";
// `field` = optional JSON path in the text ("status", "order.total").
export type Rule = { field?: string; op: RuleOp; value: string };
export type RuleGroup = { match: "all" | "any"; rules: Rule[] };
export type Route = { id: string; label: string; when: RuleGroup; description?: string };
export type Position = { x: number; y: number };
// One agent of a parallel step; its answer is {{node.<step id>.<branch id>}}.
export type ParallelBranch = { id: string; label: string; agent_kind: "agent" | "native"; agent_id: string; instruction: string };
export type FlowNode =
  | { id: string; type: "start"; position: Position; label?: string }
  | { id: string; type: "agent"; position: Position; label?: string; agent_kind: "agent" | "native"; agent_id: string; instruction: string }
  // Several agents at once on the same input. require_all: any failed agent fails the run.
  | { id: string; type: "parallel"; position: Position; label?: string; branches: ParallelBranch[]; require_all: boolean }
  | { id: string; type: "condition"; position: Position; label?: string; mode: "rule"; source: string; field?: string; op: RuleOp; value: string }
  | { id: string; type: "condition"; position: Position; label?: string; mode: "ai"; source: string; question: string }
  | { id: string; type: "router"; position: Position; label?: string; mode: "rule" | "ai"; source: string; routes: Route[]; instructions?: string }
  | { id: string; type: "approval"; position: Position; label?: string; message: string; notify: boolean }
  | { id: string; type: "notify"; position: Position; label?: string; message: string }
  | { id: string; type: "end"; position: Position; label?: string; output: string };
export type NodeType = FlowNode["type"];
export type Branch = "true" | "false" | "approved" | "rejected" | "default" | `route:${string}`;
export type FlowEdge = { id: string; from: string; to: string; branch?: Branch };
export type Flow = { version: 1; nodes: FlowNode[]; edges: FlowEdge[] };

export type ParallelBranchTrace = {
  id: string;
  label: string;
  agent_name: string;
  agent_icon: string;
  status: "pending" | "running" | "succeeded" | "failed";
  output?: string;
  error?: string;
};

export type FlowTraceEntry = {
  node_id: string;
  type: NodeType;
  label: string;
  status: "running" | "succeeded" | "failed" | "waiting" | "rejected" | "skipped";
  kind?: "agent" | "native";
  agent_name?: string;
  agent_icon?: string;
  prompt?: string;       // agent steps: what the agent was asked (first 2000 characters)
  output?: string;
  error?: string;
  branch?: Branch;
  branch_label?: string;
  branches?: ParallelBranchTrace[];   // parallel steps
  decided_by?: string;
  comment?: string;
  started_at?: string;
  finished_at?: string;
};

export type Pipeline = {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  // Set for workflows; null for linear pipelines.
  flow?: Flow | null;
  created_at: string;
  updated_at: string;
};

export type PipelineSummary = Pipeline & { last_run_status: PipelineRun["status"] | null; last_run_at: string | null };

export type StepRunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type PipelineRunStep = {
  kind?: "agent" | "native";
  provider?: "anthropic" | "openai";
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  status: StepRunStatus;
  prompt?: string;
  output?: string;
  error?: string;
  started_at?: string;
  finished_at?: string;
};

export type PipelineRun = {
  id: number;
  pipeline_id: string;
  status: "running" | "waiting" | "succeeded" | "failed" | "rejected" | "cancelled";
  input: string;
  // Linear pipelines: one entry per step. Workflows: FlowTraceEntry[].
  steps: PipelineRunStep[];
  output: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type PipelineDetail = Pipeline & { flow: Flow; is_workflow: boolean; runs: PipelineRun[] };
export type PipelineInput = Pick<Pipeline, "name" | "description" | "steps">;
export type WorkflowInput = { name: string; description: string; flow: Flow };
export type WaitingRun = PipelineRun & { pipeline_name: string };

// Client for /api/pipelines (backend routes/pipeline_routes.ts).
class PipelinesApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  async list() { return (await this.get<{ pipelines: PipelineSummary[] }>("/pipelines")).pipelines; }
  getPipeline(id: string) { return this.get<PipelineDetail>(`/pipelines/${id}`); }
  create(input: PipelineInput) { return this.post<Pipeline>("/pipelines", input); }
  update(id: string, input: PipelineInput) { return this.put<Pipeline>(`/pipelines/${id}`, input); }
  remove(id: string) { return this.delete<void>(`/pipelines/${id}`); }
  run(id: string, input: string) { return this.post<PipelineRun>(`/pipelines/${id}/run`, { input }); }
  getRun(runId: number) { return this.get<PipelineRun>(`/pipelines/runs/${runId}`); }
  createWorkflow(input: WorkflowInput) { return this.post<Pipeline>("/pipelines", input); }
  updateWorkflow(id: string, input: WorkflowInput) { return this.put<Pipeline>(`/pipelines/${id}`, input); }
  async approvals() { return (await this.get<{ runs: WaitingRun[] }>("/pipelines/approvals")).runs; }
  decide(runId: number, approved: boolean, comment?: string) { return this.post<{ status: string }>(`/pipelines/runs/${runId}/decision`, { approved, comment }); }
  cancel(runId: number) { return this.post<{ status: string }>(`/pipelines/runs/${runId}/cancel`, {}); }
}

export const pipelinesApi = new PipelinesApi();
