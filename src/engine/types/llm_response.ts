// A complete (non-streamed) model reply. Only the streaming path is used in
// the desktop app; the type stays for the shared ILLM interface.
export type LLMResponse = {
    content: string | null;
    toolCalls?: { id: string; name: string; arguments: string }[];
    finishReason: "stop" | "tool_calls" | "length" | "content_filter" | null;
};
