import { api } from "@/features/chat/api/chat_api";
import { desktop, desktopError, type LocalCommandRequest, type LocalCommandResult } from "@/shared/lib/desktop";

// An agent asked to run a command on this computer. The desktop app shows its
// own approval dialog and runs it; the outcome goes back to the server, which
// is waiting to continue the agent's turn. Outside the desktop app the answer
// is "unavailable" straight away, so the agent isn't left waiting.
export async function handleLocalCommand(request: LocalCommandRequest): Promise<LocalCommandResult> {
  let result: LocalCommandResult;
  if (!desktop?.commands) {
    result = { status: "unavailable", message: "This chat isn't open in the Owl app, so commands can't run on the user's computer." };
  } else {
    try {
      result = await desktop.commands.run(request);
    } catch (e) {
      result = { status: "unavailable", message: desktopError(e, "The desktop app couldn't run the command.") };
    }
  }
  // One retry: a dropped request would leave the agent waiting until it times out.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await api.answerLocalCommand(request.requestId, result);
      break;
    } catch (e) {
      if (attempt === 1) console.error("[local-commands] couldn't send the result:", e);
    }
  }
  return result;
}
