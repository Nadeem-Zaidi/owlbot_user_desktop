import { Outlet } from "react-router-dom";
import { SideDrawer } from "@/features/chat/components/sidebar";

// Frame shared by every signed-in page except the chat home (which lays out
// its own sidebar + chat): sidebar on the left, the routed page on the right.
// Used as a layout route in App.tsx, so the sidebar stays mounted while you
// move between pages.
export const AppShell = () => (
  <div className="chat_main">
    <div className="chat_sections">
      <SideDrawer windowId="chat-page" />
      <main className="ag_plane"><Outlet /></main>
    </div>
  </div>
);
