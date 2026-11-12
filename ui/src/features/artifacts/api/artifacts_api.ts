import { BaseApi } from "@/shared/api/base_fetch";

export type ArtifactKind = "html" | "markdown";

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  version: number;
  currentVersion: number;
  content: string;
  versions: { version: number; title: string; changeSummary: string | null; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
};

// What a create_artifact / update_artifact tool call returns (also stored in chat history).
export type ArtifactRef = { artifact_id: string; title: string; kind: ArtifactKind; version: number };

export const ARTIFACT_TOOLS = new Set(["create_artifact", "update_artifact"]);

// Pulls the artifact receipt out of a tool output (string or object).
export function parseArtifactRef(output: unknown): ArtifactRef | null {
  try {
    const o = typeof output === "string" ? JSON.parse(output) : output;
    if (o && typeof o.artifact_id === "string" && (o.kind === "html" || o.kind === "markdown")) {
      return { artifact_id: o.artifact_id, title: String(o.title ?? "Untitled"), kind: o.kind, version: Number(o.version) || 1 };
    }
  } catch {
    // not an artifact receipt
  }
  return null;
}

// Client for /api/artifacts (backend routes/artifact_routes.ts).
class ArtifactsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  load(id: string, version?: number) {
    return this.get<Artifact>(`/artifacts/${encodeURIComponent(id)}`, version ? { version } : undefined);
  }
}

export const artifactsApi = new ArtifactsApi();
