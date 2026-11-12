import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/app_shell";
import { RequireAuth } from "@/features/auth/components/require_auth";
import { HomeChat } from "@/features/chat/components/home_chat";
import { AgentsPage } from "@/features/agents/components/agents_page";
import { AgentEditor } from "@/features/agents/components/agent_editor";
import { PipelinesPage } from "@/features/pipelines/components/pipelines_page";
import { PipelineEditor } from "@/features/pipelines/components/pipeline_editor";
import { WorkflowEditor } from "@/features/pipelines/components/workflow_editor";
import { StudioPage } from "@/features/studio/components/studio_page";
import { StudioEditor } from "@/features/studio/components/studio_editor";
import { SearchPage } from "@/features/insights/components/search_page";
import { UsagePage } from "@/features/insights/components/usage_page";
import { AppearancePage } from "@/features/settings/components/appearance_page";

// The desktop app has no sign-in screen: the app's own window is the only
// thing that can reach its data (see shared/lib/firebase.ts).
const Protected = () => (
  <RequireAuth>
    <Outlet />
  </RequireAuth>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chathome" replace />} />
      <Route element={<Protected />}>
        <Route path="/chathome" element={<HomeChat />} />
        <Route element={<AppShell />}>
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:id" element={<AgentEditor />} />
          <Route path="/pipelines" element={<PipelinesPage />} />
          <Route path="/pipelines/new-workflow" element={<WorkflowEditor />} />
          <Route path="/pipelines/:id" element={<PipelineEditor />} />
          <Route path="/pipelines/:id/flow" element={<WorkflowEditor />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/studio/new" element={<StudioEditor />} />
          <Route path="/studio/:id" element={<StudioEditor />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/settings/appearance" element={<AppearancePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/chathome" replace />} />
    </Routes>
  );
}

export default App;
