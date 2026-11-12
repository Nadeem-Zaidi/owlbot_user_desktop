import { SideDrawer } from "@/features/chat/components/sidebar";
import { ChatPage } from "@/features/chat/components/chat_page";
const HOME_CHAT_WINDOW_ID = "chat-page";

export const HomeChat = () => {
  return (
    <div className="chat_main">
      <div className="chat_sections">
        <SideDrawer windowId={HOME_CHAT_WINDOW_ID} />
        <ChatPage windowId={HOME_CHAT_WINDOW_ID} title="Owl" welcomeMessage="How can I help you today?" />
      </div>
    </div>
  );
};
