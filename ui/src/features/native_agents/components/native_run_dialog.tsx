import { RunDialog } from "@/features/agents/components/run_dialog";
import { PROVIDER_LABEL, type NativeAgent } from "@/features/native_agents/api/native_agents_api";

// Run dialog for a provider agent (Claude Managed Agents / OpenAI Agents API).
export const NativeRunDialog = ({ agent, onClose }: { agent: NativeAgent; onClose: () => void }) => (
  <RunDialog
    onClose={onClose}
    target={{
      kind: "native",
      id: agent.id,
      name: agent.name,
      subtitle: `Runs once on ${PROVIDER_LABEL[agent.provider]}${agent.code_sandbox ? " (with its sandbox)" : ""}. The run is saved as a chat you can open later.`,
      placeholder: agent.web_search ? "e.g. Find today's USD → INR rate and convert 2,500 USD" : undefined,
    }}
  />
);
