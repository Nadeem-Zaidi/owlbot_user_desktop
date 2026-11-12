import { BaseApi } from "@/shared/api/base_fetch";
import type { AgentFunction, CodeFunction, CodeFunctionDraft, FunctionDraft, HttpTestResult, RunPythonResult } from "@/features/agents/types";

export type NativeProvider = "anthropic" | "openai";

export type NativeMcpServer = { name: string; url: string };

// An agent stored in Claude Managed Agents or the OpenAI Agents API.
export type NativeAgent = {
  id: string;
  provider: NativeProvider;
  remote_agent_id: string | null;
  remote_version: number | null;
  name: string;
  icon: string;
  description: string;
  instructions: string;
  model: string;
  web_search: boolean;
  code_sandbox: boolean;
  knowledge_base: boolean;
  browser: boolean;          // OpenAI computer use — ChatGPT agents only
  mcp_servers: NativeMcpServer[];
  function_count: number;
  code_function_count: number;
  created_at: string;
  updated_at: string;
  // false when the other provider is switched on
  active: boolean;
};

export type NativeFunctions = { functions: AgentFunction[]; codeFunctions: CodeFunction[]; canWriteCode: boolean };

export type NativeAgentInput = Pick<NativeAgent,
  "provider" | "name" | "icon" | "description" | "instructions" | "model" | "web_search" | "code_sandbox" | "knowledge_base" | "browser" | "mcp_servers">;

export type NativeOverview = {
  activeProvider: NativeProvider | null;
  canWriteCode: boolean;
  providers: { id: NativeProvider; label: string; models: string[] }[];
  agents: NativeAgent[];
};

// Client for /api/native-agents (backend routes/native_agent_routes.ts).
class NativeAgentsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  overview() { return this.get<NativeOverview>("/native-agents"); }
  setActiveProvider(provider: NativeProvider) { return this.put<NativeOverview>("/native-agents/active-provider", { provider }); }
  create(input: NativeAgentInput) { return this.post<NativeAgent>("/native-agents", input); }
  update(id: string, input: NativeAgentInput) { return this.put<NativeAgent>(`/native-agents/${id}`, input); }
  remove(id: string) { return this.delete<void>(`/native-agents/${id}`); }
  // Answer for the agent's hosted browser (allow a site / sign in / cancel).
  answerApproval(requestId: string, body: Record<string, unknown>) { return this.post<{ ok: true }>(`/native-agents/approvals/${encodeURIComponent(requestId)}`, body); }

  // Functions — same signatures as agentsApi so the function dialogs work unchanged.
  functions(agentId: string) { return this.get<NativeFunctions>(`/native-agents/${agentId}/functions`); }
  createFunction(agentId: string, fn: FunctionDraft) { return this.post<AgentFunction>(`/native-agents/${agentId}/functions`, fn); }
  updateFunction(agentId: string, id: string, fn: FunctionDraft) { return this.put<AgentFunction>(`/native-agents/${agentId}/functions/${id}`, fn); }
  deleteFunction(agentId: string, id: string) { return this.delete<void>(`/native-agents/${agentId}/functions/${id}`); }
  testFunction(agentId: string, fn: FunctionDraft, args: Record<string, unknown>, functionId?: string) {
    return this.post<HttpTestResult>(`/native-agents/${agentId}/functions/test`, { function: fn, args, functionId });
  }
  createCodeFunction(agentId: string, fn: CodeFunctionDraft) { return this.post<CodeFunction>(`/native-agents/${agentId}/code-functions`, fn); }
  updateCodeFunction(agentId: string, id: string, fn: Partial<CodeFunctionDraft>) { return this.put<CodeFunction>(`/native-agents/${agentId}/code-functions/${id}`, fn); }
  deleteCodeFunction(agentId: string, id: string) { return this.delete<void>(`/native-agents/${agentId}/code-functions/${id}`); }
  testCodeFunction(agentId: string, fn: CodeFunctionDraft, args: Record<string, unknown>, functionId?: string) {
    return this.post<RunPythonResult>(`/native-agents/${agentId}/code-functions/test`, { function: fn, args, functionId });
  }
}

export const nativeAgentsApi = new NativeAgentsApi();

export const PROVIDER_LABEL: Record<NativeProvider, string> = { anthropic: "Claude", openai: "ChatGPT" };
export const PLATFORM_LABEL: Record<NativeProvider, string> = { anthropic: "Claude Managed Agents", openai: "OpenAI Agents API" };
