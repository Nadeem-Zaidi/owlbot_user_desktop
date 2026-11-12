import { BotMessage } from "@/features/chat/components/bot_message";

// An agent's answer rendered as Markdown (headings, lists, tables, code with
// copy) — the chat's renderer, in a compact scrollable box for side panels
// and run views. `tall` for dialogs.
export const MarkdownOutput = ({ text, tall, className }: { text: string; tall?: boolean; className?: string }) => (
  <div className={`md_output ${tall ? "md_output--tall" : ""} ${className ?? ""}`}>
    <BotMessage text={text} />
  </div>
);
