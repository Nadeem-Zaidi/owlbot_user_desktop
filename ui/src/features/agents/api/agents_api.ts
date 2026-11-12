import { BaseApi } from "@/shared/api/base_fetch";
import type {
  AgentCatalog, AgentDetail, AgentDraft, AgentFunction, AgentInput, AgentRun, AgentSummary, Agent, CodeFunction, CodeFunctionDraft,
  FunctionDraft, HttpTestResult, McpServer, McpTool, RunPythonResult, Schedule, ScheduleDraft,
} from "@/features/agents/types";

// Client for /api/agents (see owlbot backend routes/agent_routes.ts).
class AgentsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  catalog() { return this.get<AgentCatalog>("/agents/catalog"); }
  async list() { return (await this.get<{ agents: AgentSummary[] }>("/agents")).agents; }
  getAgent(id: string) { return this.get<AgentDetail>(`/agents/${id}`); }
  create(input: AgentInput) { return this.post<Agent>("/agents", input); }
  update(id: string, input: AgentInput) { return this.put<Agent>(`/agents/${id}`, input); }
  remove(id: string) { return this.delete<void>(`/agents/${id}`); }
  draft(description: string) { return this.post<AgentDraft>("/agents/draft", { description }); }

  createFunction(agentId: string, fn: FunctionDraft) { return this.post<AgentFunction>(`/agents/${agentId}/functions`, fn); }
  updateFunction(agentId: string, id: string, fn: FunctionDraft) { return this.put<AgentFunction>(`/agents/${agentId}/functions/${id}`, fn); }
  deleteFunction(agentId: string, id: string) { return this.delete<void>(`/agents/${agentId}/functions/${id}`); }
  testFunction(agentId: string, fn: FunctionDraft, args: Record<string, unknown>, functionId?: string) {
    return this.post<HttpTestResult>(`/agents/${agentId}/functions/test`, { function: fn, args, functionId });
  }

  createCodeFunction(agentId: string, fn: CodeFunctionDraft) { return this.post<CodeFunction>(`/agents/${agentId}/code-functions`, fn); }
  updateCodeFunction(agentId: string, id: string, fn: Partial<CodeFunctionDraft>) { return this.put<CodeFunction>(`/agents/${agentId}/code-functions/${id}`, fn); }
  deleteCodeFunction(agentId: string, id: string) { return this.delete<void>(`/agents/${agentId}/code-functions/${id}`); }
  testCodeFunction(agentId: string, fn: CodeFunctionDraft, args: Record<string, unknown>, functionId?: string) {
    return this.post<RunPythonResult>(`/agents/${agentId}/code-functions/test`, { function: fn, args, functionId });
  }

  async discoverMcp(url: string, token?: string) {
    return (await this.post<{ tools: McpTool[] }>("/agents/mcp/discover", { url, token })).tools;
  }
  addMcp(agentId: string, body: { name: string; url: string; token?: string; enabledTools: string[] }) {
    return this.post<McpServer>(`/agents/${agentId}/mcp`, body);
  }
  updateMcp(agentId: string, id: string, body: { name?: string; url?: string; token?: string; enabledTools?: string[] }) {
    return this.put<McpServer>(`/agents/${agentId}/mcp/${id}`, body);
  }
  refreshMcp(agentId: string, id: string) { return this.post<McpServer>(`/agents/${agentId}/mcp/${id}/refresh`); }
  deleteMcp(agentId: string, id: string) { return this.delete<void>(`/agents/${agentId}/mcp/${id}`); }

  createSchedule(agentId: string, s: ScheduleDraft) { return this.post<Schedule>(`/agents/${agentId}/schedules`, s); }
  updateSchedule(agentId: string, id: string, s: Partial<ScheduleDraft>) { return this.put<Schedule>(`/agents/${agentId}/schedules/${id}`, s); }
  deleteSchedule(agentId: string, id: string) { return this.delete<void>(`/agents/${agentId}/schedules/${id}`); }
  runSchedule(agentId: string, id: string) { return this.post<{ started: boolean }>(`/agents/${agentId}/schedules/${id}/run`); }
  async runs(agentId: string) { return (await this.get<{ runs: AgentRun[] }>(`/agents/${agentId}/runs`)).runs; }
}

export const agentsApi = new AgentsApi();
