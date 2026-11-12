// Generated with schema.ts: how the SQLite adapter converts values it reads.
// A column read straight from a table is converted by that table's entry; a computed
// column (an aggregate, COALESCE...) by its name, when the name means one thing everywhere.
export type ColumnKind = "json" | "bool" | "date";
export const COLUMN_KINDS: Record<string, Record<string, ColumnKind>> = {
    "agent_code_functions": {
        "parameters": "json",
        "secrets": "json",
        "enabled": "bool",
        "created_at": "date",
        "updated_at": "date"
    },
    "agent_functions": {
        "parameters": "json",
        "headers": "json",
        "enabled": "bool",
        "created_at": "date"
    },
    "agent_mcp_servers": {
        "tools": "json",
        "created_at": "date",
        "updated_at": "date"
    },
    "agent_runs": {
        "started_at": "date",
        "finished_at": "date"
    },
    "agent_schedules": {
        "deliver_whatsapp": "bool",
        "enabled": "bool",
        "next_run_at": "date",
        "last_run_at": "date",
        "created_at": "date",
        "deliver_email": "bool",
        "email_to": "json"
    },
    "agents": {
        "builtin_tools": "json",
        "document_keys": "json",
        "starters": "json",
        "created_at": "date",
        "updated_at": "date",
        "instruction_files": "json",
        "skill_ids": "json",
        "helper_agent_ids": "json",
        "limits": "json"
    },
    "app_settings": {
        "value": "json",
        "updated_at": "date"
    },
    "artifact_versions": {
        "created_at": "date"
    },
    "artifacts": {
        "created_at": "date",
        "updated_at": "date"
    },
    "automation_alerts": {
        "read_at": "date",
        "created_at": "date"
    },
    "automation_settings": {
        "updated_at": "date"
    },
    "chat_messages": {
        "content": "json",
        "metadata": "json",
        "arguments": "json",
        "output": "json",
        "created_at": "date"
    },
    "document_styles": {
        "updated_at": "date"
    },
    "generated_files": {
        "created_at": "date"
    },
    "native_agents": {
        "web_search": "bool",
        "code_sandbox": "bool",
        "knowledge_base": "bool",
        "mcp_servers": "json",
        "created_at": "date",
        "updated_at": "date",
        "browser": "bool"
    },
    "pipeline_runs": {
        "steps": "json",
        "started_at": "date",
        "finished_at": "date",
        "state": "json"
    },
    "pipelines": {
        "steps": "json",
        "created_at": "date",
        "updated_at": "date",
        "flow": "json"
    },
    "session_summaries": {
        "updated_at": "date"
    },
    "sessions": {
        "created_at": "date",
        "updated_at": "date",
        "pinned_at": "date"
    },
    "agent_files": {
        "truncated": "bool",
        "created_at": "date"
    },
    "skill_files": {
        "created_at": "date"
    },
    "skills": {
        "enabled": "bool",
        "created_at": "date",
        "updated_at": "date"
    },
    "studio_projects": {
        "canvas": "json",
        "deliver_result": "bool",
        "next_run_at": "date",
        "last_triggered_at": "date",
        "created_at": "date",
        "updated_at": "date"
    },
    "tasks": {
        "remind_at": "date",
        "last_reminded_at": "date",
        "created_at": "date",
        "updated_at": "date",
        "completed_at": "date"
    },
    "token_usage": {
        "created_at": "date",
        "byok": "bool"
    },
    "user_llm_keys": {
        "models": "json",
        "enabled": "bool",
        "last_verified_at": "date",
        "created_at": "date",
        "updated_at": "date"
    },
    "user_memories": {
        "created_at": "date",
        "updated_at": "date"
    },
    "user_memory_settings": {
        "updated_at": "date"
    },
    "user_settings": {
        "updated_at": "date"
    },
    "web_watchers": {
        "next_check_at": "date",
        "last_checked_at": "date",
        "last_match": "bool",
        "last_alert_at": "date",
        "created_at": "date",
        "updated_at": "date"
    },
    "workspace_members": {
        "joined_at": "date"
    },
    "workspaces": {
        "created_at": "date",
        "updated_at": "date"
    }
};
export const JSON_NAMES = new Set<string>(["arguments", "builtin_tools", "canvas", "document_keys", "email_to", "flow", "headers", "helper_agent_ids", "instruction_files", "limits", "mcp_servers", "metadata", "models", "parameters", "secrets", "skill_ids", "starters", "state", "steps", "tools", "value"]);
export const BOOL_NAMES = new Set<string>(["browser", "byok", "code_sandbox", "deliver_email", "deliver_result", "deliver_whatsapp", "enabled", "knowledge_base", "last_match", "web_search"]);
export const DATE_NAMES = new Set<string>(["completed_at", "created_at", "finished_at", "joined_at", "last_alert_at", "last_checked_at", "last_reminded_at", "last_run_at", "last_triggered_at", "last_verified_at", "next_check_at", "next_run_at", "pinned_at", "read_at", "remind_at", "started_at", "updated_at"]);
