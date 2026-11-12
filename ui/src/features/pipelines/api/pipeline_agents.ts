import { agentsApi } from "@/features/agents/api/agents_api";
import { nativeAgentsApi, PROVIDER_LABEL, type NativeProvider } from "@/features/native_agents/api/native_agents_api";
import type { PipelineStep } from "@/features/pipelines/api/pipelines_api";

// Anything a pipeline step can run: a regular agent or a provider agent.
export type StepAgent = {
  kind: "agent" | "native";
  id: string;
  name: string;
  icon: string;
  description: string;
  provider?: NativeProvider;
  // false for provider agents whose provider isn't switched on
  active: boolean;
};

export const stepKey = (s: Pick<PipelineStep, "kind" | "agent_id">) => `${s.kind ?? "agent"}:${s.agent_id}`;

export const providerLabel = (p?: NativeProvider) => (p ? PROVIDER_LABEL[p] : "");

// Both kinds; provider agents are left out quietly if that API isn't available.
export async function loadStepAgents(): Promise<StepAgent[]> {
  const [agents, native] = await Promise.all([
    agentsApi.list(),
    nativeAgentsApi.overview().catch(() => null),
  ]);
  return [
    ...agents.map((a): StepAgent => ({ kind: "agent", id: a.id, name: a.name, icon: a.icon, description: a.description, active: true })),
    ...(native?.agents ?? []).map((a): StepAgent => ({
      kind: "native", id: a.id, name: a.name, icon: a.icon, description: a.description, provider: a.provider, active: a.active,
    })),
  ];
}
