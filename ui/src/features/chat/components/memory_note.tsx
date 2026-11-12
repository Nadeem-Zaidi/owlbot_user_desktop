import { Brain } from "lucide-react";
import type { MemoryEvent } from "@/features/chat/lib/memory_events";

const LABEL: Record<MemoryEvent["action"], string> = {
  saved: "Memory updated",
  proposed: "Memory suggested",
  forgot: "Forgot",
};

// A quiet line under a reply when the assistant saved or removed a memory,
// with a link to review it (and undo).
export const MemoryNote = ({ events, onManage }: { events: MemoryEvent[]; onManage: () => void }) => (
  <div className="memory_note" role="status">
    <Brain size={14} className="memory_note__icon" aria-hidden="true" />
    <span className="memory_note__text">
      {events.map((e, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <strong>{LABEL[e.action]}</strong>
          {e.text && <>: “{e.text}”</>}
        </span>
      ))}
    </span>
    <button type="button" className="memory_note__link" onClick={onManage}>
      {events.some((e) => e.action === "proposed") ? "Review" : "Manage"}
    </button>
  </div>
);
