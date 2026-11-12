// Generated: see the header inside.
export const SCHEMA = `
-- Generated from the Owl backend's migrated Postgres schema (33 migrations).
-- JSON and array columns are TEXT holding JSON; booleans are 0/1; timestamps are ISO-8601 UTC text.

CREATE TABLE IF NOT EXISTS "agent_code_functions" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "code" TEXT NOT NULL,
  "parameters" TEXT NOT NULL DEFAULT '[]',
  "secrets" TEXT NOT NULL DEFAULT '[]',
  "timeout_ms" INTEGER NOT NULL DEFAULT 15000,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE (agent_id, name)
);

CREATE TABLE IF NOT EXISTS "agent_functions" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "method" TEXT NOT NULL DEFAULT 'GET',
  "url" TEXT NOT NULL,
  "parameters" TEXT NOT NULL DEFAULT '[]',
  "headers" TEXT NOT NULL DEFAULT '[]',
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE (agent_id, name)
);

CREATE TABLE IF NOT EXISTS "agent_mcp_servers" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "auth_token" TEXT,
  "tools" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "schedule_id" TEXT,
  "agent_id" TEXT NOT NULL,
  "session_id" TEXT,
  "status" TEXT NOT NULL,
  "output" TEXT,
  "error" TEXT,
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "finished_at" TEXT,
  FOREIGN KEY (schedule_id) REFERENCES agent_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs (agent_id, started_at DESC);

CREATE TABLE IF NOT EXISTS "agent_schedules" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "interval_hours" INTEGER,
  "time_of_day" TEXT,
  "weekday" INTEGER,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "deliver_whatsapp" INTEGER NOT NULL DEFAULT 0,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "session_id" TEXT,
  "next_run_at" TEXT,
  "last_run_at" TEXT,
  "last_status" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deliver_email" INTEGER NOT NULL DEFAULT 0,
  "email_to" TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_schedules_due ON agent_schedules (next_run_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS "agents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '🤖',
  "description" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "provider" TEXT,
  "model" TEXT,
  "builtin_tools" TEXT NOT NULL DEFAULT '[]',
  "document_keys" TEXT NOT NULL DEFAULT '[]',
  "starters" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "instruction_files" TEXT NOT NULL DEFAULT '[]',
  "skill_mode" TEXT NOT NULL DEFAULT 'all',
  "skill_ids" TEXT NOT NULL DEFAULT '[]',
  "helper_agent_ids" TEXT NOT NULL DEFAULT '[]',
  "workspace_id" TEXT,
  "limits" TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents (workspace_id, updated_at DESC) WHERE (workspace_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_agents_personal ON agents (user_id, updated_at DESC) WHERE (workspace_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS "artifact_versions" (
  "artifact_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "change_summary" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (artifact_id, version),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "artifacts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts (session_id) WHERE (session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS "automation_alerts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "ref_id" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "delivered_via" TEXT NOT NULL DEFAULT 'app',
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_automation_alerts_user ON automation_alerts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "automation_settings" (
  "user_id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "session_id" TEXT NOT NULL,
  "role" TEXT,
  "type" TEXT,
  "content" TEXT,
  "metadata" TEXT,
  "name" TEXT,
  "arguments" TEXT,
  "tool_call_id" TEXT,
  "output" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_order ON chat_messages (session_id, id);

CREATE TABLE IF NOT EXISTS "document_styles" (
  "user_id" TEXT NOT NULL,
  "company" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#2A74A8',
  "font" TEXT NOT NULL DEFAULT 'Calibri',
  "footer" TEXT NOT NULL DEFAULT '',
  "currency" TEXT NOT NULL DEFAULT '₹',
  "logo" TEXT,
  "logo_mime" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS "generated_files" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT,
  "kind" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "s3_key" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_files_user ON generated_files (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "native_agents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "remote_agent_id" TEXT,
  "remote_version" INTEGER,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '🤖',
  "description" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL,
  "web_search" INTEGER NOT NULL DEFAULT 0,
  "code_sandbox" INTEGER NOT NULL DEFAULT 0,
  "knowledge_base" INTEGER NOT NULL DEFAULT 0,
  "mcp_servers" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "browser" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_native_agents_user ON native_agents (user_id, provider);

CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "pipeline_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "input" TEXT NOT NULL DEFAULT '',
  "steps" TEXT NOT NULL DEFAULT '[]',
  "output" TEXT,
  "error" TEXT,
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "finished_at" TEXT,
  "state" TEXT,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs (pipeline_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_waiting ON pipeline_runs (user_id) WHERE (status = 'waiting');

CREATE TABLE IF NOT EXISTS "pipelines" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "steps" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "flow" TEXT,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_pipelines_user ON pipelines (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS "session_summaries" (
  "session_id" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "upto_index" INTEGER NOT NULL,
  "model" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (session_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New Chat',
  "model" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "userid" TEXT,
  "source" TEXT NOT NULL DEFAULT 'web',
  "agent_id" TEXT,
  "native_agent_id" TEXT,
  "remote_session_id" TEXT,
  "pinned_at" TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (native_agent_id) REFERENCES native_agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_native_agent ON sessions (native_agent_id) WHERE (native_agent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions (agent_id) WHERE (agent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_pinned ON sessions (userid, pinned_at DESC) WHERE (pinned_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_userid_updated ON sessions (userid, updated_at DESC);

CREATE TABLE IF NOT EXISTS "skill_files" (
  "skill_id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (skill_id, path),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "skills" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "license" TEXT,
  "source" TEXT,
  PRIMARY KEY (id),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS "studio_projects" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "canvas" TEXT NOT NULL,
  "pipeline_id" TEXT,
  "trigger_type" TEXT NOT NULL DEFAULT 'manual',
  "chat_command" TEXT,
  "deliver_result" INTEGER NOT NULL DEFAULT 0,
  "webhook_hash" TEXT,
  "webhook_secret" TEXT,
  "next_run_at" TEXT,
  "last_triggered_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL,
  UNIQUE (webhook_hash)
);
CREATE INDEX IF NOT EXISTS idx_studio_projects_user ON studio_projects (user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_projects_command ON studio_projects (user_id, chat_command) WHERE (chat_command IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_studio_projects_due ON studio_projects (next_run_at) WHERE (trigger_type = 'schedule');
CREATE INDEX IF NOT EXISTS idx_studio_projects_pipeline ON studio_projects (pipeline_id);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'open',
  "remind_at" TEXT,
  "repeat" TEXT NOT NULL DEFAULT 'none',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "anchor_day" INTEGER,
  "last_reminded_at" TEXT,
  "source" TEXT NOT NULL DEFAULT 'web',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (remind_at) WHERE ((status = 'open') AND (remind_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS "token_usage" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT,
  "agent_id" TEXT,
  "source" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'chat',
  "provider" TEXT,
  "model" TEXT,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
  "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
  "requests" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "byok" INTEGER NOT NULL DEFAULT 0,
  "key_id" TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_time ON token_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage (session_id);

CREATE TABLE IF NOT EXISTS "user_llm_keys" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "base_url" TEXT,
  "api_key_enc" TEXT NOT NULL,
  "key_hint" TEXT NOT NULL,
  "models" TEXT NOT NULL DEFAULT '[]',
  "default_model" TEXT,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TEXT,
  "last_error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (user_id, label)
);
CREATE INDEX IF NOT EXISTS idx_user_llm_keys_user ON user_llm_keys (user_id);

CREATE TABLE IF NOT EXISTS "user_memories" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'chat',
  "session_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS "user_memory_settings" (
  "user_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'auto',
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS "user_settings" (
  "user_id" TEXT NOT NULL,
  "native_provider" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS "web_watchers" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'change',
  "condition" TEXT NOT NULL DEFAULT '',
  "interval_minutes" INTEGER NOT NULL DEFAULT 360,
  "status" TEXT NOT NULL DEFAULT 'active',
  "next_check_at" TEXT,
  "last_checked_at" TEXT,
  "last_hash" TEXT,
  "last_text" TEXT,
  "last_match" INTEGER,
  "last_result" TEXT,
  "last_alert_at" TEXT,
  "last_error" TEXT,
  "fail_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_web_watchers_due ON web_watchers (next_check_at) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS idx_web_watchers_user ON web_watchers (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "display_name" TEXT NOT NULL DEFAULT '',
  "email" TEXT,
  "phone_hint" TEXT,
  "invited_by" TEXT,
  "joined_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_one_owner ON workspace_members (workspace_id) WHERE (role = 'owner');
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);

-- Desktop only (not from the server schema): files given to one agent.
-- Only the extracted text is kept; agent_file_chunks is its full-text index.
CREATE TABLE IF NOT EXISTS "agent_files" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "chars" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "truncated" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (agent_id, name),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE VIRTUAL TABLE IF NOT EXISTS agent_file_chunks USING fts5(
  content, file_id UNINDEXED, agent_id UNINDEXED, seq UNINDEXED, tokenize = 'porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS agent_files_delete_chunks AFTER DELETE ON agent_files BEGIN
  DELETE FROM agent_file_chunks WHERE file_id = old.id;
END;
`;
