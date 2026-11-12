import { useCallback, useEffect, useRef, useState } from "react";
import { UsedTools } from "@/features/chat/components/used_tools";
import { addUsed, describeToolUse, usedForAssistantMessage, type UsedItem } from "@/features/chat/lib/tool_usage";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SERVER_FEATURES, SHOW_MARKETPLACE } from "@/shared/lib/features";
import { ArrowUp, BookOpenText, FileSpreadsheet, HardDrive, Lightbulb, Pin, PinOff, Search, Square, X, Zap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/store";
import { auth } from "@/shared/lib/firebase";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { Agent } from "@/features/agents/types";
import { nativeAgentsApi, PROVIDER_LABEL, type NativeAgent } from "@/features/native_agents/api/native_agents_api";
import { BrowserApprovalCard, BrowserScreenshot, type BrowserApproval, type BrowserApprovalRequest } from "@/features/native_agents/components/browser_approval";
import { LocalCommandCard, type LocalCommandItem } from "@/features/chat/components/local_command_card";
import { handleLocalCommand } from "@/features/chat/lib/local_commands";
import type { LocalCommandRequest } from "@/shared/lib/desktop";
import type {
  CodeInterpreterContent,
  CodeInterpreterFileRef,
  ContentPart,
  FileAttachment,
  FileInput,
  ImageUrlContent,
  KnowledgeDocument,
  LLMFileUploadResponse,
  LLMMessage,
  MessageUsage,
  Session,
  TextAttachment,
  TextContent,
} from "@/shared/types";

import { updateChatMode } from "@/features/chat/state/chat_mode_slice";
import { api, type StreamChunk } from "@/features/chat/api/chat_api";
import { BotMessage } from "@/features/chat/components/bot_message";
import { formatTokens } from "@/features/insights/api/insights_api";
import { appendCacheMessage, clearCacheMessage, closeWindow, endSessionStream, loadMessages, loadSessions, newSession, openWindow, replaceLastMessage, setActiveSession, setChatMode, setSessionPinned, startSessionStream } from "@/features/chat/state/session_slice";
import { FileComponent } from "@/features/chat/components/file_component";
import { CodeInterpreterCard } from "@/features/chat/components/code_interpreter_card";
import { ToolCallCard } from "@/features/chat/components/tool_call_card";
import { ArtifactCard } from "@/features/artifacts/components/artifact_card";
import { ArtifactPanel } from "@/features/artifacts/components/artifact_panel";
import { ARTIFACT_TOOLS, parseArtifactRef, type ArtifactRef } from "@/features/artifacts/api/artifacts_api";
import { MEMORY_TOOLS, memoryEvent, memoryEventsForAssistantMessage, type MemoryEvent } from "@/features/chat/lib/memory_events";
import { MemoryNote } from "@/features/chat/components/memory_note";
import { DOCUMENT_TOOLS, filesForAssistantMessage, generatedFileFrom, type GeneratedFile } from "@/features/documents/api/documents_api";
import { GeneratedFileCard } from "@/features/documents/components/generated_file_card";
import { DocumentViewer } from "@/features/documents/components/document_viewer";
import { CHART_TOOL, chartFrom, chartsForAssistantMessage, type ChartSpec } from "@/features/charts/lib/chart_spec";
import { ChartCard, ChartSkeleton } from "@/features/charts/components/chart_card";
import { ThinkingOwl, OwlMark } from "@/shared/ui/owl_icon";
import { ModelSelector } from "@/features/chat/components/model_selector";
import { useLLMProvider } from "@/features/chat/hooks/use_llm_provider";
import { AttachMenu } from "@/features/chat/components/attach_menu";
import { DocumentPicker } from "@/features/chat/components/document_picker";
import { WhatsAppConnect } from "@/features/whatsapp/components/whatsapp_connect";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { DocumentCard, SourceChips } from "@/features/chat/components/knowledge_parts";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { asDocumentPart, buildExplainDocumentParts, displayName, KB_SEARCH_INSTRUCTION } from "@/features/chat/lib/chat_utils";
import { isDesktop } from "@/shared/lib/desktop";
import { localContextPart } from "@/features/local_knowledge/lib/local_context";

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = auth.currentUser?.displayName?.split(" ")[0];
  return firstName ? `${part}, ${firstName}` : part;
}


export interface ChatPageProps {
  windowId: string;
  title?: string;
  welcomeMessage?: string;
  showTopBar?: boolean;
  className?: string;
}

type ToolInfo = {
  name: string;
  args: string;
  done: boolean;
  result?: string;
  source: "function" | "mcp" | "code_interpreter";
  serverLabel?: string;
  code?: string;                     // code_interpreter only — accumulated as it streams in
  status?: string;                   // code_interpreter only — "in_progress" | "interpreting" | "completed" | "failed"
  files?: CodeInterpreterFileRef[];  // code_interpreter only — generated files
};
const RAG_TOOL_NAME = "search_knowledge_base";
function extractSourceFilenames(output: string | undefined): string[] {
  if (!output) return [];
  try {
    const parsed = JSON.parse(output);
    const results = parsed?.results;
    if (!Array.isArray(results)) return [];
    return results
      .map((r: any) => r?.source_file)
      // Full keys, not basenames — clicking a source fetches the document by key.
      .filter((f: unknown): f is string => typeof f === "string" && f.length > 0);
  } catch {
    return [];
  }
}

function getSourcesForAssistantMessage(messages: LLMMessage[], assistantIndex: number): string[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if ((messages[i] as any).role === "user") {
      start = i + 1;
      break;
    }
  }

  const toolCallNames: Record<string, string> = {};
  const sources = new Set<string>();

  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i] as any;
    if (m.role === "tool_call" && m.tool_call_id && m.name) {
      toolCallNames[m.tool_call_id] = m.name;
    }
    if (m.role === "tool_call_output" && m.tool_call_id) {
      const name = toolCallNames[m.tool_call_id];
      if (name === RAG_TOOL_NAME) {
        const outputStr = typeof m.output === "string" ? m.output : JSON.stringify(m.output);
        extractSourceFilenames(outputStr).forEach((f) => sources.add(f));
      }
    }
  }

  return Array.from(sources);
}

// Documents (artifacts) created or updated in the turn that ends with this
// assistant message — rebuilt from the saved tool outputs after a reload.
function getArtifactsForAssistantMessage(messages: LLMMessage[], assistantIndex: number): ArtifactRef[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if ((messages[i] as any).role === "user") { start = i + 1; break; }
  }
  const names: Record<string, string> = {};
  const byId = new Map<string, ArtifactRef>();
  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i] as any;
    if (m.role === "tool_call" && m.tool_call_id && m.name) names[m.tool_call_id] = m.name;
    if (m.role === "tool_call_output" && m.tool_call_id && ARTIFACT_TOOLS.has(names[m.tool_call_id])) {
      const ref = parseArtifactRef(m.output);
      if (ref) byId.set(ref.artifact_id, ref);   // latest version wins
    }
  }
  return [...byId.values()];
}

// Shows a provider agent with the same header/welcome/chip as a regular agent.
const nativeAsAgent = (n: NativeAgent): Agent => ({
  id: n.id,
  name: n.name,
  icon: n.icon,
  description: n.description || `${PROVIDER_LABEL[n.provider]} agent`,
  instructions: n.instructions,
  provider: n.provider,
  model: n.model,
  builtin_tools: [],
  document_keys: [],
  starters: [],
  instruction_files: [],
  created_at: n.created_at,
  updated_at: n.updated_at,
});

// "⚡ 7.1k tokens" under a reply; hover for the breakdown.
const UsageBadge = ({ usage }: { usage: MessageUsage }) => {
  const cached = usage.cache_read_tokens + usage.cache_write_tokens;
  const detail = [
    `Input: ${usage.input_tokens.toLocaleString()}`,
    cached ? `Cached input: ${cached.toLocaleString()}` : null,
    `Output: ${usage.output_tokens.toLocaleString()}`,
    usage.requests > 1 ? `${usage.requests} model calls (tools)` : null,
    usage.model ? `Model: ${usage.model}` : null,
  ].filter(Boolean).join("\n");
  return <span className="msg_usage" title={detail}><Zap size={11} /> {formatTokens(usage.total_tokens)} tokens</span>;
};

type SessionStreamState = {
  buffer: string;
  botMessageAdded: boolean;
  activeTools: Record<string, ToolInfo>;
  mcpStatus: string;
  sources: string[];
  artifacts: ArtifactRef[];
  memories: MemoryEvent[];
  files: GeneratedFile[];
  charts: ChartSpec[];
  // Skills, skill files, functions, MCP tools and agents used for this answer.
  used: UsedItem[];
  usage?: MessageUsage;
};

export const ChatPage = ({
  windowId,
  title = "Owl",
  welcomeMessage = "How can I help you today?",
  showTopBar = true,
  className = "",
}: ChatPageProps) => {
  const dispatch = useAppDispatch();
  const chatMode = useSelector((state: any) => state.session.windows[windowId]?.chatMode ?? false);
  const activeSessionId = useSelector((state: any) => state.session.windows[windowId]?.activeSessionId ?? null);
  const sessions: Session[] = useAppSelector((state) => state.session.sessions);
  const cacheMessages = useSelector((state: any) => state.session.windows[windowId]?.cacheChatMessages ?? []);
  const chatTokens = cacheMessages.reduce((sum: number, m: LLMMessage) => sum + (m.metadata?.usage?.total_tokens ?? 0), 0);
  const streamingSessionIds: string[] = useSelector((state: any) => state.session.streamingSessionIds ?? []);
  const isStreaming = activeSessionId ? streamingSessionIds.includes(activeSessionId) : false;
  const [mcpStatus, setMcpStatus] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamErrorCode, setStreamErrorCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pastedTexts, setPastedTexts] = useState<TextAttachment[]>([]);

  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [uploadResults, setUploadResults] = useState<(LLMFileUploadResponse | undefined)[]>([]);
  const [uploadErrors, setUploadErrors] = useState<(string | undefined)[]>([]);
  const [activeTools, setActiveTools] = useState<Record<string, ToolInfo>>({});
  // The document open in the side panel (and a counter to reload it after a new version).
  const [openArtifact, setOpenArtifact] = useState<{ id: string; version?: number } | null>(null);
  const [artifactRefresh, setArtifactRefresh] = useState(0);
  // A generated Word/Excel file open in the same side panel (one panel at a time).
  const [openFile, setOpenFile] = useState<GeneratedFile | null>(null);
  useEffect(() => { setOpenArtifact(null); setOpenFile(null); }, [activeSessionId]);
  const toggleArtifact = (ref: ArtifactRef) => {
    setOpenFile(null);
    setOpenArtifact((cur) => (cur?.id === ref.artifact_id ? null : { id: ref.artifact_id }));
  };
  const toggleFile = (file: GeneratedFile) => {
    setOpenArtifact(null);
    setOpenFile((cur) => (cur?.id === file.id ? null : file));
  };
  // Provider agents' hosted browser: pending approvals and the latest screenshot.
  const [browserApprovals, setBrowserApprovals] = useState<BrowserApproval[]>([]);
  // Commands agents asked to run on this computer (desktop app), per chat;
  // they stay visible until the next message in that chat.
  const [localCommands, setLocalCommands] = useState<(LocalCommandItem & { sessionId: string })[]>([]);
  const [browserShot, setBrowserShot] = useState<string | null>(null);
  const { providers, selection, setSelection } = useLLMProvider();

  // ── agents ──
  // /chathome?agent=<id> starts a new chat with that agent; /chathome?session=<id>
  // opens a specific chat (e.g. a schedule's results).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAgentId = searchParams.get("agent");
  const urlNativeId = searchParams.get("native");
  const urlSessionId = searchParams.get("session");
  // Chats created on this page for an agent, before the sessions list knows.
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({});
  const [nativeSessions, setNativeSessions] = useState<Record<string, string>>({});
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeAgentId: string | null =
    activeSession?.agent_id ?? (activeSessionId ? agentSessions[activeSessionId] : urlAgentId) ?? null;
  // /chathome?native=<id>: a provider agent (Claude Managed Agents / OpenAI Agents API).
  const activeNativeId: string | null = activeAgentId ? null :
    activeSession?.native_agent_id ?? (activeSessionId ? nativeSessions[activeSessionId] : urlNativeId) ?? null;
  const [agent, setAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();
  const [kbMode, setKbMode] = useState(false);
  // Word & Excel tools: only sent to the model when turned on (saves ~1.2k tokens a message).
  const [docsMode, setDocsMode] = useState(false);
  // Desktop app: send matching passages from local folders with each message.
  const [localMode, setLocalMode] = useState(false);
  const [localSearching, setLocalSearching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [explainingKey, setExplainingKey] = useState<string | null>(null);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const pageRef = useRef<HTMLDivElement>(null);
  const pinnedToUserRef = useRef(false);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const lastScrolledIndex = useRef(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!urlAgentId && !urlNativeId) return;
    dispatch(setActiveSession({ windowId, sessionId: null }));
    dispatch(clearCacheMessage({ windowId }));
    dispatch(setChatMode({ windowId, chatMode: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAgentId, urlNativeId]);

  useEffect(() => {
    if (!urlSessionId) return;
    dispatch(setActiveSession({ windowId, sessionId: urlSessionId }));
    dispatch(setChatMode({ windowId, chatMode: true }));
    dispatch(loadSessions());
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAgentId && activeNativeId) {
      nativeAgentsApi.overview()
        .then((o) => {
          const n = o.agents.find((a) => a.id === activeNativeId);
          if (!cancelled) setAgent(n ? nativeAsAgent(n) : null);
        })
        .catch(() => !cancelled && setAgent(null));
      return () => {
        cancelled = true;
      };
    }
    if (!activeAgentId) {
      setAgent(null);
      return;
    }
    agentsApi.getAgent(activeAgentId)
      .then((a) => !cancelled && setAgent(a))
      .catch(() => !cancelled && setAgent(null));
    return () => {
      cancelled = true;
    };
  }, [activeAgentId, activeNativeId]);

  // Grow the composer with its content (CSS max-height caps it, then it scrolls).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  const sessionStreamsRef = useRef<Record<string, SessionStreamState>>({});
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const filesRef = useRef<FileAttachment[]>(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const streamingSessionIdsRef = useRef<string[]>(streamingSessionIds);

  useEffect(() => {
    streamingSessionIdsRef.current = streamingSessionIds;
  }, [streamingSessionIds]);

  useEffect(() => {
    dispatch(openWindow({ windowId }));
    return () => {
      dispatch(closeWindow({ windowId }));
    };
  }, []);

  useEffect(() => {
    dispatch(loadSessions());
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      dispatch(loadMessages({ windowId, sessionId: activeSessionId }));
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!chatMode) dispatch(clearCacheMessage({ windowId }));
  }, [chatMode]);

  useEffect(() => {
    return () => {
      if (streamingSessionIdsRef.current.length > 0) {
        api.abortChat();
      }
    };
  }, []);

  useEffect(() => {
    const cont = pageRef.current;
    if (!cont || cacheMessages.length === 0) return;
    const lastMsg = cacheMessages[cacheMessages.length - 1];

    if (lastMsg.role === "user") {
      const userIndex = cacheMessages.length - 1;
      if (userIndex !== lastScrolledIndex.current) {
        lastScrolledIndex.current = userIndex;
        pinnedToUserRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = lastUserMsgRef.current;
            if (!el) return;
            el.scrollIntoView({ block: "start", behavior: "smooth" });
          });
        });
      }
      return;
    }

    if (lastMsg.role === "assistant" && bottomAnchorRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const c = pageRef.current;
          const anchor = bottomAnchorRef.current;
          if (!c || !anchor) return;

          const cr = c.getBoundingClientRect();
          const ar = anchor.getBoundingClientRect();

          if (pinnedToUserRef.current) {
            if (ar.top > cr.bottom + 20) {
              pinnedToUserRef.current = false;
            } else {
              return;
            }
          }

          if (ar.top > cr.bottom + 300) return;
          if (ar.top < cr.bottom - 100) return;

          c.scrollTo({
            top: Math.max(0, ar.top - cr.top + c.scrollTop - c.clientHeight + 60),
            behavior: "smooth",
          });
        });
      });
      return;
    }
  }, [cacheMessages]);

  // ── helpers ────────────────────────────────────────────────────────────────
  // extraParts carries code_interpreter content parts (see the isDone
  // handling below) — without it, the code interpreter card only ever
  // exists in the transient `activeTools` state and disappears the instant
  // resetSessionStream() clears that state at the end of the turn, even
  // though the card (and any generated image) rendered correctly moments
  // earlier while the reply was still streaming.
  function updateBotMessage(sessionState: SessionStreamState, text: string, extraParts: ContentPart[] = []) {
    const messagePayload = {
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }, ...extraParts],
      sources: sessionState.sources.length ? sessionState.sources : undefined,
      artifacts: sessionState.artifacts.length ? sessionState.artifacts : undefined,
      memories: sessionState.memories.length ? sessionState.memories : undefined,
      files: sessionState.files.length ? sessionState.files : undefined,
      charts: sessionState.charts.length ? sessionState.charts : undefined,
      used: sessionState.used.length ? sessionState.used : undefined,
      ...(sessionState.usage ? { metadata: { usage: sessionState.usage } } : {}),
    } as LLMMessage;

    if (!sessionState.botMessageAdded) {
      sessionState.botMessageAdded = true;
      dispatch(appendCacheMessage({
        windowId,
        messages: [messagePayload],
      }));
    } else {
      dispatch(replaceLastMessage({
        windowId,
        message: messagePayload,
      }));
    }
  }

  const fileAccumulator = files.map((_, i) => ({
    fileId: uploadResults[i]?.fileId,
    error: uploadErrors[i],
  }));

  const uploadOneFile = async (file: FileAttachment, index: number) => {
    try {
      const res = await api.uploadFile(file.file);
      setUploadResults((prev) => {
        const next = [...prev];
        next[index] = res;
        return next;
      });
    } catch (err: any) {
      setUploadErrors((prev) => {
        const next = [...prev];
        next[index] = err?.message ?? "Upload failed";
        return next;
      });
    }
  };

  // Single entry point for adding attachments — used by both the file picker
  // and paste, so every attachment (including pasted images) goes through
  // the same state + upload pipeline instead of being dropped in a dead state.
  const addAttachments = (newAttachments: FileAttachment[]) => {
    if (!newAttachments.length) return;
    const startIndex = filesRef.current.length;

    setFiles((prev) => [...prev, ...newAttachments]);
    setUploadResults((prev) => [...prev, ...newAttachments.map(() => undefined)]);
    setUploadErrors((prev) => [...prev, ...newAttachments.map(() => undefined)]);

    newAttachments.forEach((attachment, offset) => {
      uploadOneFile(attachment, startIndex + offset);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newAttachments: FileAttachment[] = Array.from(selectedFiles).map((file) => ({
      name: file.name,
      extension: file.name.split(".").pop() ?? "",
      file,
      isImage: file.type.startsWith("image/"),
    }));

    addAttachments(newAttachments);
    e.target.value = ""; // lets picking the same file again re-trigger onChange
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadResults((prev) => prev.filter((_, i) => i !== index));
    setUploadErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((i) => i.type.startsWith("image/"));
    if (imageItems.length) {
      e.preventDefault();
      const newAttachments: FileAttachment[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        const extension = file.type.split("/").pop() ?? "png";
        newAttachments.push({
          name: file.name || `pasted-image-${Date.now()}.${extension}`,
          extension,
          file,
          isImage: true,
        });
      }
      addAttachments(newAttachments);
      return;
    }

    const fileItems = items.filter((i) => i.kind === "file" && !i.type.startsWith("image/"));
    if (fileItems.length) {
      e.preventDefault();
      const newAttachments: FileAttachment[] = [];
      for (const item of fileItems) {
        const file = item.getAsFile();
        if (!file) continue;
        const extension = file.name.split(".").pop() ?? "FILE";
        newAttachments.push({ name: file.name, extension, file, isImage: false });
      }
      addAttachments(newAttachments);
      return;
    }

    const text = e.clipboardData.getData("text");
    if (text.length > 500) {
      e.preventDefault();
      setPastedTexts((prev) => [...prev, { name: `Pasted text (${prev.length + 1})`, content: text }]);
    }
  };

  const resetSessionStream = (sessionId: string) => {
    delete sessionStreamsRef.current[sessionId];
    dispatch(endSessionStream({ sessionId }));
    if (sessionId === activeSessionIdRef.current) {
      setActiveTools({});
      setBrowserApprovals([]);
      setMcpStatus("");
      pinnedToUserRef.current = false;
    }
  };

  const handleSend = async () => {
    const llmUploadResponse = uploadResults.filter((r): r is LLMFileUploadResponse => !!r);
    if (!input.trim() && !llmUploadResponse.length && !pastedTexts.length) return;
    if (isStreaming || localSearching) return;

    const content: ContentPart[] = [];
    if (input.trim()) {
      content.push({ type: "text", text: input.trim() } as TextContent);
      if (kbMode) content.push(KB_SEARCH_INSTRUCTION);
      if (localMode && isDesktop) {
        setLocalSearching(true);
        try {
          const local = await localContextPart(input.trim());
          if (local) content.push(local.part);
        } finally {
          setLocalSearching(false);
        }
      }
    }
    for (const pastedText of pastedTexts) {
      content.push({ type: "text", text: pastedText.content } as TextContent);
    }
    for (const response of llmUploadResponse) {
      if (response.isImage) {
        // Backend's message_repository.ts KNOWN_TYPES allowlist (and
        // openai_provider.ts's fromInput switch) only recognize
        // "input_url_image" with a nested image_url.url — "input_image"
        // was silently stripped out on reload, which is why the model
        // never actually saw the image.
        content.push({
          type: "input_url_image",
          image_url: { url: response.url, detail: "auto" },
        } as ImageUrlContent);
      } else {
        content.push({
          type: "input_file",
          file_id: response.fileId,
          fileName: response.name,
          fileExtension: response.extension,
          fileUrl: response.url,
          // Only set for csv/xls/xlsx — see storage_routes.ts's
          // uploadAndIndex(). openai_provider.ts reads this back out of the
          // saved conversation to attach the file to the code interpreter
          // container's file_ids on every turn.
          openaiFileId: response.openaiFileId,
        } as FileInput);
      }
    }

    await sendContent(content, () => {
      setInput("");
      setPastedTexts([]);
      setFiles([]);
      setUploadResults([]);
      setUploadErrors([]);
    });
  };

  // Fetches a knowledge-base document's full text and asks the model to
  // explain it in detail. Used by source chips and the document picker.
  const explainDocument = async (key: string) => {
    if (isStreaming || explainingKey) return;
    setExplainingKey(key);
    setStreamError(null);
    try {
      const doc = await api.getDocumentContent(key);
      await sendContent(buildExplainDocumentParts(doc), () => setExplainingKey(null));
    } catch (err) {
      setStreamError(`Couldn't open “${displayName(key)}”: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setExplainingKey(null);
    }
  };

  // Shared send path: creates the session if needed, shows the user message,
  // and streams the reply. `onStarted` runs once the request is underway
  // (so a failed session creation doesn't wipe what the user typed).
  const sendContent = async (content: ContentPart[], onStarted?: () => void) => {
    let sessionId: string | null = activeSessionId;
    const agentIdForSend = activeAgentId ?? undefined;
    const nativeIdForSend = activeNativeId ?? undefined;
    if (!sessionId) {
      const result = await dispatch(newSession({ windowId }));
      if (newSession.fulfilled.match(result)) {
        sessionId = result.payload.session.id;
        if (agentIdForSend) setAgentSessions((m) => ({ ...m, [sessionId as string]: agentIdForSend }));
        if (nativeIdForSend) setNativeSessions((m) => ({ ...m, [sessionId as string]: nativeIdForSend }));
      } else {
        setStreamError("Failed to start a new session");
        return;
      }
    }

    if (streamingSessionIds.includes(sessionId)) return;

    if (!chatMode) {
      dispatch(setChatMode({ windowId, chatMode: true }));
      dispatch(updateChatMode({ chatMode: true, currentSessionId: sessionId }));
    }

    const messageToSend: LLMMessage = { type: "message", role: "user", content };
    activeSessionIdRef.current = sessionId
    if (sessionId === activeSessionIdRef.current) {
      dispatch(appendCacheMessage({ windowId, messages: [messageToSend] }));
    }

    const sessionIdForStream = sessionId;
    setBrowserShot(null);
    setBrowserApprovals([]);
    setLocalCommands((list) => list.filter((c) => c.sessionId !== sessionIdForStream));
    sessionStreamsRef.current[sessionIdForStream] = {
      buffer: "",
      botMessageAdded: false,
      activeTools: {},
      mcpStatus: "",
      sources: [],
      artifacts: [],
      memories: [],
      files: [],
      charts: [],
      used: [],
    };
    dispatch(startSessionStream({ sessionId: sessionIdForStream }));

    onStarted?.();
    setStreamError(null);

    const isVisible = () => sessionIdForStream === activeSessionIdRef.current;

    await api.sendMessage(sessionIdForStream, messageToSend, (chunk: StreamChunk) => {
      const s = sessionStreamsRef.current[sessionIdForStream];
      if (!s) return;

      if (chunk.type === "error") {
        console.error("Stream error:", chunk.code, chunk.message);
        if (isVisible()) {
          setStreamError(chunk.message ?? "Something went wrong");
          setStreamErrorCode(chunk.code ?? null);
        }
        resetSessionStream(sessionIdForStream);
        return;
      }

      if (chunk.type === "function_call" && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: { name: chunk.name ?? "", args: "", done: false, source: "function" },
        };
        if (isVisible()) setActiveTools(s.activeTools);
      }

      // The backend sends "function_call_arguments" with `arguments`.
      if ((chunk.type === "function_call_arguments" || chunk.type === "function_call_args") && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: { ...s.activeTools[chunk.tool_call_id], args: chunk.arguments ?? chunk.args ?? "" },
        };
        if (isVisible()) setActiveTools(s.activeTools);
      }

      if (chunk.type === "function_call_output" && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: { ...s.activeTools[chunk.tool_call_id], done: true, result: chunk.output },
        };
        if (isVisible()) setActiveTools(s.activeTools);
        const calledToolName = s.activeTools[chunk.tool_call_id]?.name;
        const usedNow = addUsed(s.used, describeToolUse(calledToolName, s.activeTools[chunk.tool_call_id]?.args));
        if (usedNow !== s.used) {
          s.used = usedNow;
          if (s.botMessageAdded) updateBotMessage(s, s.buffer);
        }
        if (calledToolName === CHART_TOOL) {
          const chart = chartFrom(chunk.output);
          if (chart) {
            s.charts = [...s.charts, chart];
            updateBotMessage(s, s.buffer);
          }
        }
        if (DOCUMENT_TOOLS.has(calledToolName)) {
          const file = generatedFileFrom(chunk.output);
          if (file) {
            s.files = [...s.files, file];
            updateBotMessage(s, s.buffer);
            if (isVisible()) {
              setOpenArtifact(null);
              setOpenFile(file);
            }
          }
        }
        if (MEMORY_TOOLS.has(calledToolName)) {
          const event = memoryEvent(calledToolName, s.activeTools[chunk.tool_call_id]?.args, chunk.output);
          if (event) {
            s.memories = [...s.memories, event];
            updateBotMessage(s, s.buffer);
          }
        }
        if (ARTIFACT_TOOLS.has(calledToolName)) {
          const ref = parseArtifactRef(chunk.output);
          if (ref) {
            s.artifacts = [...s.artifacts.filter((a) => a.artifact_id !== ref.artifact_id), ref];
            updateBotMessage(s, s.buffer);
            if (isVisible()) {
              setOpenFile(null);
              setOpenArtifact({ id: ref.artifact_id });
              setArtifactRefresh((n) => n + 1);
            }
          }
        }
        if (calledToolName === RAG_TOOL_NAME) {
          const filenames = extractSourceFilenames(chunk.output);
          if (filenames.length) {
            s.sources = Array.from(new Set([...s.sources, ...filenames]));
            if (isVisible() && s.botMessageAdded) {
              updateBotMessage(s, s.buffer);
            }
          }
        }
      }
      if (chunk.type === "mcp_call_arguments" && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: { ...s.activeTools[chunk.tool_call_id], args: chunk.args ?? "" },
        };
        if (isVisible()) setActiveTools(s.activeTools);
      }

      if (chunk.type === "mcp_call_output" && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: { ...s.activeTools[chunk.tool_call_id], done: true, result: chunk.output },
        };
        if (isVisible()) setActiveTools(s.activeTools);
        const t = s.activeTools[chunk.tool_call_id];
        const usedNow = addUsed(s.used, describeToolUse(t?.name ?? "", t?.args, t?.serverLabel ?? "MCP"));
        if (usedNow !== s.used) {
          s.used = usedNow;
          if (s.botMessageAdded) updateBotMessage(s, s.buffer);
        }
      }

      if (chunk.type === "mcp_list_tools") {
        const toolNames = Array.isArray(chunk.tools) ? chunk.tools.map((t: any) => t.name).join(", ") : "";
        s.mcpStatus = `Connected to ${chunk.server_label ?? "MCP server"}${toolNames ? ` (${toolNames})` : ""}`;
        if (isVisible()) setMcpStatus(s.mcpStatus);
      }

      if (chunk.type === "mcp_approval_request") {
        s.mcpStatus = `Waiting for approval to run "${chunk.name}" on ${chunk.server_label ?? "MCP server"}`;
        if (isVisible()) setMcpStatus(s.mcpStatus);
      }

      if (chunk.type === "code_interpreter_call" && chunk.tool_call_id) {
        s.activeTools = {
          ...s.activeTools,
          [chunk.tool_call_id]: {
            name: "Code Interpreter",
            args: "",
            done: false,
            source: "code_interpreter",
            code: "",
            status: "in_progress",
            files: [],
          },
        };
        if (isVisible()) setActiveTools(s.activeTools);
      }

      if (chunk.type === "code_interpreter_call_code_delta" && chunk.tool_call_id) {
        const existing = s.activeTools[chunk.tool_call_id];
        if (existing) {
          s.activeTools = {
            ...s.activeTools,
            [chunk.tool_call_id]: { ...existing, code: (existing.code ?? "") + (chunk.delta ?? "") },
          };
          if (isVisible()) setActiveTools(s.activeTools);
        }
      }

      if (chunk.type === "code_interpreter_call_code_done" && chunk.tool_call_id) {
        const existing = s.activeTools[chunk.tool_call_id];
        if (existing) {
          s.activeTools = {
            ...s.activeTools,
            [chunk.tool_call_id]: { ...existing, code: chunk.code ?? existing.code },
          };
          if (isVisible()) setActiveTools(s.activeTools);
        }
      }

      if (chunk.type === "code_interpreter_call_status" && chunk.tool_call_id) {
        const existing = s.activeTools[chunk.tool_call_id];
        if (existing) {
          s.activeTools = {
            ...s.activeTools,
            [chunk.tool_call_id]: {
              ...existing,
              status: chunk.status,
              done: chunk.status === "completed" || chunk.status === "failed",
            },
          };
          if (isVisible()) setActiveTools(s.activeTools);
        }
      }

      if (chunk.type === "code_interpreter_file") {
        // OpenAI cites generated files on the response text, not tied to a
        // specific call id — in practice there's only ever one open code
        // interpreter call per turn, so attribute the file to the most
        // recently started one still in this turn's activeTools.
        const codeInterpreterEntries = Object.entries(s.activeTools).filter(([, t]) => t.source === "code_interpreter");
        const targetId = codeInterpreterEntries[codeInterpreterEntries.length - 1]?.[0];
        if (targetId && chunk.file_id && chunk.container_id) {
          const existing = s.activeTools[targetId];
          const files = [...(existing.files ?? []), { file_id: chunk.file_id, container_id: chunk.container_id, filename: chunk.filename, url: (chunk as any).url }];
          s.activeTools = { ...s.activeTools, [targetId]: { ...existing, files } };
          if (isVisible()) setActiveTools(s.activeTools);
        }
      }

      if (chunk.type === "sources" && Array.isArray((chunk as any).sources)) {
        const incoming = (chunk as any).sources as string[];
        s.sources = Array.from(new Set([...s.sources, ...incoming]));
        if (isVisible() && s.botMessageAdded) {
          updateBotMessage(s, s.buffer);
        }
      }

      // Handled even if another chat is on screen: the agent is waiting for the answer.
      if (chunk.type === "local_command_request" && chunk.request) {
        const request = chunk.request as LocalCommandRequest;
        setLocalCommands((list) => [...list, { request, sessionId: sessionIdForStream }]);
        void handleLocalCommand(request).then((result) =>
          setLocalCommands((list) => list.map((c) => (c.request.requestId === request.requestId ? { ...c, result } : c))));
      }

      if (chunk.type === "approval_request" && chunk.request && isVisible()) {
        setBrowserApprovals((list) => [...list, { request: chunk.request as BrowserApprovalRequest }]);
      }
      if (chunk.type === "approval_resolved" && chunk.request_id && isVisible()) {
        setBrowserApprovals((list) => list.map((a) => (a.request.requestId === chunk.request_id ? { ...a, outcome: chunk.outcome } : a)));
      }
      if (chunk.type === "browser_screenshot" && chunk.image && isVisible()) {
        setBrowserShot(chunk.image);
      }

      if (chunk.type === "usage" && chunk.usage) {
        s.usage = chunk.usage;
        if (isVisible() && s.botMessageAdded) updateBotMessage(s, s.buffer);
      }

      if (chunk.type === "session_title") {
        dispatch(loadSessions());
      }

      if (chunk.content) {
        for (const c of chunk.content) {
          if (c.type === "output_text" || c.type === "text") {
            s.buffer += c.text;
            if (isVisible()) updateBotMessage(s, s.buffer);
          }
        }
      }

      if (chunk.isDone) {
        if (Array.isArray((chunk as any).sources) && (chunk as any).sources.length) {
          s.sources = Array.from(new Set([...s.sources, ...(chunk as any).sources]));
        }

        // Fold this turn's code interpreter call(s) — code, final status,
        // generated files — into the persisted assistant message before
        // activeTools gets wiped by resetSessionStream() below. Without
        // this, the card (and any chart image) the user just watched
        // stream in would vanish the instant the reply finishes, only to
        // reappear after a full page reload once it's read back from the DB.
        const codeInterpreterParts: ContentPart[] = Object.values(s.activeTools)
          .filter((t) => t.source === "code_interpreter")
          .map((t) => ({
            type: "code_interpreter",
            code: t.code ?? "",
            status: t.status ?? "completed",
            files: t.files ?? [],
          } as unknown as ContentPart));

        if (isVisible() && (s.botMessageAdded || codeInterpreterParts.length)) {
          updateBotMessage(s, s.buffer, codeInterpreterParts);
        }
        resetSessionStream(sessionIdForStream);
      }
    }, selection, agentIdForSend, nativeIdForSend, docsMode ? ["documents"] : []);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removePastedText = (i: number) => setPastedTexts((p) => p.filter((_, idx) => idx !== i));

  const cancelStream = async () => {
    if (!activeSessionId) return;

    await api.abortChat(activeSessionId);
    resetSessionStream(activeSessionId);
  };

  return (
    <div className={`chat_plane ${className} ${openArtifact || openFile ? "has_artifact" : ""}`}>
      {showTopBar && (
        <div className="chat_topbar">
          <span className="chat_topbar__brand" title={title}>
            <span className="chat_topbar__logo"><OwlMark size={22} /></span>
            <span className="chat_topbar__title">{agent ? <><span className="topbar_agent_icon"><AgentAvatar icon={agent.icon} /></span>{agent.name}</> : title}</span>
          </span>
          {chatTokens > 0 && (
            <button type="button" className="topbar_usage" onClick={() => navigate("/usage")} title="Tokens used in this chat — open the Usage page">
              <Zap size={12} /> {formatTokens(chatTokens)} tokens
            </button>
          )}
          {activeSessionId && chatMode && (() => {
            const current = sessions.find((x) => x.id === activeSessionId);
            if (!current) return null;
            const pinned = !!current.pinned_at;
            return (
              <button
                type="button"
                className={`topbar_action topbar_pin ${pinned ? "is_pinned" : ""}`}
                onClick={() => void dispatch(setSessionPinned({ sessionId: current.id, pinned: !pinned }))}
                title={pinned ? "Unpin this chat" : "Pin this chat to favourites"}
                aria-pressed={pinned}
              >
                {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                <span>{pinned ? "Pinned" : "Pin"}</span>
              </button>
            );
          })()}
          {SERVER_FEATURES && activeSessionId && chatMode && (
            <button type="button" className="topbar_action" onClick={() => setContinueOpen(true)} title="Continue this chat on your phone">
              <FontAwesomeIcon icon={faWhatsapp} />
              <span>Continue in WhatsApp</span>
            </button>
          )}
        </div>
      )}

      <div className={chatMode ? "page" : "page_chatMode"} ref={pageRef}>
        <div className={`message_area ${cacheMessages.length > 2 ? "scrollable" : ""}`}>
          {cacheMessages.length === 0 && <div className="empty_state" />}

          {cacheMessages.map((msg: LLMMessage, i: number) => {
            const isLastUser =
              msg.role === "user" &&
              i === cacheMessages.findLastIndex((m: LLMMessage) => m.role === "user");
            if (!msg.content || !Array.isArray(msg.content)) return null;
            const parts = msg.content;

            if (msg.role === "user") {
              const hasRenderablePart = parts.some(
                (m) => m.type === "text" || m.type === "input_url_image" || m.type === "input_file"
              );
              if (!hasRenderablePart) return null;

              return (
                <div key={i} ref={isLastUser ? lastUserMsgRef : undefined} className="message user_message">
                  {parts.map((m, j) => {
                    if (m.type === "input_url_image") {
                      const img = m as ImageUrlContent;
                      if (!img.image_url?.url) return null;
                      return (
                        <img
                          key={`${i}-${j}`}
                          src={img.image_url.url}
                          alt="Attached image"
                          className="user_message_image"
                        />
                      );
                    }
                    if (m.type === "input_file") {
                      const f = m as FileInput;
                      return (
                        <a
                          key={`${i}-${j}`}
                          className="user_message_file"
                          href={f.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="user_message_file_icon">
                            {(f.fileExtension ?? "FILE").slice(0, 4).toUpperCase()}
                          </span>
                          <span className="user_message_file_name">{f.fileName ?? "Attached file"}</span>
                        </a>
                      );
                    }
                    if (m.type === "text") {
                      if ((m as TextContent).hidden) return null;
                      const doc = asDocumentPart(m);
                      if (doc) return <DocumentCard key={`${i}-${j}`} part={doc} />;
                      return (
                        <span key={`${i}-${j}`} className="user_message_text">
                          {(m as TextContent).text}
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
              );
            } else if (msg.role === "assistant") {
              const liveSources = (msg as any).sources as string[] | undefined;
              const msgSources = liveSources && liveSources.length
                ? liveSources
                : getSourcesForAssistantMessage(cacheMessages, i);
              const liveArtifacts = (msg as any).artifacts as ArtifactRef[] | undefined;
              const msgArtifacts = liveArtifacts && liveArtifacts.length
                ? liveArtifacts
                : getArtifactsForAssistantMessage(cacheMessages, i);
              const liveCharts = (msg as any).charts as ChartSpec[] | undefined;
              const msgCharts = liveCharts && liveCharts.length ? liveCharts : chartsForAssistantMessage(cacheMessages as any[], i);
              const liveFiles = (msg as any).files as GeneratedFile[] | undefined;
              const msgFiles = liveFiles && liveFiles.length ? liveFiles : filesForAssistantMessage(cacheMessages as any[], i);
              const liveUsed = (msg as { used?: UsedItem[] }).used;
              const msgUsed = liveUsed && liveUsed.length ? liveUsed : usedForAssistantMessage(cacheMessages, i);
              const liveMemories = (msg as any).memories as MemoryEvent[] | undefined;
              const msgMemories = liveMemories && liveMemories.length
                ? liveMemories
                : memoryEventsForAssistantMessage(cacheMessages as any[], i);
              return (
                <div key={i} className="assistant_turn">
                  {parts.map((m, j) => {
                    if (m.type === "output_text" || m.type === "text") {
                      if (!(m as TextContent).text) return null;
                      return <BotMessage key={`${i}-${j}`} text={(m as TextContent).text} />;
                    }
                    if (m.type === "code_interpreter") {
                      const ci = m as CodeInterpreterContent;
                      return (
                        <CodeInterpreterCard
                          key={`${i}-${j}`}
                          code={ci.code}
                          status={ci.status}
                          done
                          files={ci.files ?? []}
                        />
                      );
                    }
                    return null;
                  })}
                  {msgCharts.map((c, k) => <ChartCard key={`chart-${k}`} spec={c} />)}
                  {msgArtifacts.map((a) => (
                    <ArtifactCard
                      key={a.artifact_id}
                      title={a.title}
                      kind={a.kind}
                      version={a.version}
                      open={openArtifact?.id === a.artifact_id}
                      onToggle={() => toggleArtifact(a)}
                    />
                  ))}
                  {msgFiles.map((f) => <GeneratedFileCard key={f.id} file={f} open={openFile?.id === f.id} onOpen={() => toggleFile(f)} />)}
                  {msgMemories.length > 0 && (
                    <MemoryNote events={msgMemories} onManage={() => navigate("/settings/memory")} />
                  )}
                  <UsedTools items={msgUsed} />
                  {msgSources && msgSources.length > 0 && (
                    <SourceChips
                      sources={msgSources}
                      onExplain={explainDocument}
                      loadingKey={explainingKey}
                      disabled={isStreaming}
                    />
                  )}
                  {msg.metadata?.usage && <UsageBadge usage={msg.metadata.usage} />}
                </div>
              );
            }
          })}

          {streamError && (
            <div className="message error_message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10" stroke="#C0392B" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="#C0392B" strokeWidth="2"
                  strokeLinecap="round" />
              </svg>
              <span>
                {streamError}
                {streamErrorCode === "quota_exceeded" && (
                  <button type="button" className="chat_quota" onClick={() => navigate("/billing")}>Upgrade</button>
                )}
                {streamErrorCode === "insufficient_credits" && (
                  <button type="button" className="chat_quota" onClick={() => navigate("/credits")}>Add credits</button>
                )}
              </span>
            </div>
          )}
          {isStreaming && sessionStreamsRef.current[activeSessionId ?? ""]?.buffer === "" && Object.keys(activeTools).length === 0 && (
            <div className="thinking-bubble">
              <ThinkingOwl />
            </div>
          )}

          {Object.entries(activeTools).map(([callId, tool]) =>
            ARTIFACT_TOOLS.has(tool.name) ? (
              tool.done ? null : <ArtifactCard key={callId} title="" pending />
            ) : MEMORY_TOOLS.has(tool.name) ? null : tool.name === CHART_TOOL ? (
              tool.done ? null : <ChartSkeleton key={callId} />
            ) : DOCUMENT_TOOLS.has(tool.name) ? (
              tool.done ? null : <GeneratedFileCard key={callId} pending kind={tool.name === "create_excel_file" ? "excel" : "word"} />
            ) : tool.source === "code_interpreter" ? (
              <CodeInterpreterCard
                key={callId}
                code={tool.code ?? ""}
                status={tool.status}
                done={tool.done}
                files={tool.files ?? []}
              />
            ) : (
              <ToolCallCard
                key={callId}
                name={tool.name}
                args={tool.args}
                result={tool.result}
                done={tool.done}
                source={tool.source}
                serverLabel={tool.serverLabel}
              />
            )
          )}

          {browserShot && <BrowserScreenshot image={browserShot} />}
          {browserApprovals.map((a) => <BrowserApprovalCard key={a.request.requestId} approval={a} />)}
          {localCommands.filter((c) => c.sessionId === activeSessionId).map((c) => <LocalCommandCard key={c.request.requestId} item={c} />)}

          {mcpStatus && <div className="mcp_status">{mcpStatus}</div>}
          <div ref={bottomAnchorRef} />
        </div>
      </div>

      {openArtifact && (
        <ArtifactPanel
          key={`${openArtifact.id}:${artifactRefresh}`}
          artifactId={openArtifact.id}
          version={openArtifact.version}
          onClose={() => setOpenArtifact(null)}
        />
      )}
      {openFile && <DocumentViewer key={openFile.id} file={openFile} onClose={() => setOpenFile(null)} />}

      <div className={`chat_input_wrapper ${!chatMode ? "centered" : ""}`}>
        {!chatMode && (
          agent ? (
            <div className="welcome">
              <span className="welcome__logo welcome__logo--agent"><AgentAvatar icon={agent.icon} /></span>
              <h1 className="welcome__title">{agent.name}</h1>
              <p className="welcome__subtitle">{agent.description || "Ask me anything."}</p>
            </div>
          ) : (
            <div className="welcome">
              <span className="welcome__logo"><OwlMark size={30} /></span>
              <h1 className="welcome__title">{greeting()}</h1>
              <p className="welcome__subtitle">{welcomeMessage}</p>
            </div>
          )
        )}
        <div className="chat_input">
          {files.length > 0 && (
            <div className="attachment_pills">
              {files.map((f, i) => (
                <FileComponent
                  key={`file-${i}-${f.name}`}
                  file={f}
                  upload={true}
                  index={i}
                  fileIdAccumulator={fileAccumulator}
                  removeFile={() => removeFile(i)}
                />
              ))}
            </div>
          )}

          {pastedTexts.length > 0 && (
            <div className="attachment_pills">
              {pastedTexts.map((pt, i) => (
                <div className="pasted_content" key={`pasted-${i}-${pt.name}`}>
                  <div className="pasted_content_icon txt">TXT</div>
                  <div className="pasted_content_meta">
                    <span className="pasted_content_text" title={pt.content}>{pt.name}</span>
                    <span className="pasted_content_type">{pt.content.length.toLocaleString()} chars</span>
                  </div>
                  <button
                    type="button"
                    className="pasted_content_remove"
                    aria-label={`Remove ${pt.name}`}
                    onClick={() => removePastedText(i)}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isStreaming}
            rows={1}
            placeholder={kbMode ? "Ask about your documents…" : localMode ? "Ask about your local files…" : `Message ${agent?.name ?? title}…`}
            aria-label="Message"
          />

          <div className="chat_input_bottom">
            <div className="chat_input_bottom__dropdown_options">
              <AttachMenu
                onFilesSelected={handleFileSelect}
                onExplainDocument={() => setPickerOpen(true)}
                onManageKnowledgeBase={() => navigate("/file_explorer")}
                kbMode={kbMode}
                onToggleKbMode={() => {
                  setKbMode((v) => !v);
                  textareaRef.current?.focus();
                }}
                docsMode={docsMode}
                onToggleDocsMode={() => {
                  setDocsMode((v) => !v);
                  textareaRef.current?.focus();
                }}
                localMode={localMode}
                onToggleLocalMode={isDesktop ? () => {
                  setLocalMode((v) => !v);
                  textareaRef.current?.focus();
                } : undefined}
                disabled={isStreaming}
              />
              {kbMode && (
                <span className="mode_chip">
                  <Search size={13} />
                  Knowledge base
                  <button type="button" onClick={() => setKbMode(false)} aria-label="Turn off knowledge base search">
                    <X size={12} />
                  </button>
                </span>
              )}
              {docsMode && (
                <span className="mode_chip" title="The reply can create Word and Excel files">
                  <FileSpreadsheet size={13} />
                  Word &amp; Excel
                  <button type="button" onClick={() => setDocsMode(false)} aria-label="Turn off Word and Excel files">
                    <X size={12} />
                  </button>
                </span>
              )}
              {localMode && (
                <span className="mode_chip" title="Matching passages from your local folders are sent with each message">
                  <HardDrive size={13} />
                  {localSearching ? "Searching local files…" : "Local files"}
                  <button type="button" onClick={() => setLocalMode(false)} aria-label="Stop using local files">
                    <X size={12} />
                  </button>
                </span>
              )}
              {agent ? (
                <span className="mode_chip agent_chip" title={`Chatting with ${agent.name} · ${agent.model ?? "default model"}`}>
                  <span className="agent_chip__icon"><AgentAvatar icon={agent.icon} /></span> {agent.name}
                </span>
              ) : (
                <ModelSelector
                  providers={providers}
                  value={selection}
                  onChange={setSelection}
                  disabled={isStreaming}
                  onBrowse={SHOW_MARKETPLACE ? () => navigate("/models") : undefined}
                />
              )}
            </div>

            <div className="chat_input_bottom__functional_options">
              {isStreaming ? (
                <button type="button" className="stop_btn" onClick={cancelStream} aria-label="Stop generating" title="Stop">
                  <Square size={12} fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  className="send_btn"
                  onClick={handleSend}
                  disabled={localSearching || (!input.trim() && !uploadResults.some(Boolean) && !pastedTexts.length)}
                  aria-label="Send message"
                  title="Send"
                >
                  <ArrowUp size={18} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </div>

        {!chatMode && agent && agent.starters.length > 0 && (
          <div className="suggestions suggestions--starters">
            {agent.starters.map((starter) => (
              <button key={starter} type="button" className="suggestion" onClick={() => sendContent([{ type: "text", text: starter } as TextContent])}>
                <span><strong>{starter}</strong></span>
              </button>
            ))}
          </div>
        )}

        {!chatMode && !agent && (
          <div className="suggestions">
            <button type="button" className="suggestion" onClick={() => setPickerOpen(true)}>
              <BookOpenText size={16} />
              <span>
                <strong>Explain a document</strong>
                <small>Detailed walkthrough of a file in your knowledge base</small>
              </span>
            </button>
            <button
              type="button"
              className="suggestion"
              onClick={() => {
                setKbMode(true);
                textareaRef.current?.focus();
              }}
            >
              <Search size={16} />
              <span>
                <strong>Ask your knowledge base</strong>
                <small>Answers grounded in your own documents</small>
              </span>
            </button>
            <button
              type="button"
              className="suggestion"
              onClick={() => {
                setInput("Explain how attention works in transformers, step by step.");
                textareaRef.current?.focus();
              }}
            >
              <Lightbulb size={16} />
              <span>
                <strong>Learn a concept</strong>
                <small>e.g. how attention works in transformers</small>
              </span>
            </button>
          </div>
        )}

        {chatMode && <p className="composer_disclaimer">AI can make mistakes. Check important information.</p>}
      </div>

      {continueOpen && activeSessionId && (
        <WhatsAppConnect mode="continue" sessionId={activeSessionId} onClose={() => setContinueOpen(false)} />
      )}

      {pickerOpen && (
        <DocumentPicker
          onClose={closePicker}
          onPick={(doc: KnowledgeDocument) => explainDocument(doc.key)}
        />
      )}
    </div>
  );
};