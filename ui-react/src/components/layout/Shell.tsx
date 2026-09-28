import React from "react";
import { useAppStore } from "../../store/appStore.ts";
import { FileExplorerPanel } from "../chat/FileExplorerPanel.tsx";
import { MainContent } from "./MainContent.tsx";
import { NavSidebar } from "./NavSidebar.tsx";
import { Topbar } from "./Topbar.tsx";

export function Shell() {
  const tab = useAppStore((s) => s.tab);
  const onboarding = useAppStore((s) => s.onboarding);
  const navCollapsed = useAppStore((s) => s.settings.navCollapsed);
  const chatFocusMode = useAppStore((s) => s.settings.chatFocusMode);
  const fileExplorerOpen = useAppStore((s) => s.settings.fileExplorerOpen === true);

  const isChat = tab === "chat";
  const chatFocus = isChat && (chatFocusMode || onboarding);
  const explorerOpen = isChat && fileExplorerOpen && !onboarding;

  const shellClass = [
    "shell",
    isChat ? "shell--chat" : "",
    chatFocus ? "shell--chat-focus" : "",
    navCollapsed ? "shell--nav-collapsed" : "",
    explorerOpen ? "shell--explorer" : "",
    onboarding ? "shell--onboarding" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <Topbar />
      <NavSidebar />
      <MainContent />
      {explorerOpen && <FileExplorerPanel />}
    </div>
  );
}
