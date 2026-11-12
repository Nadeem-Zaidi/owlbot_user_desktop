import { contextBridge, ipcRenderer } from "electron";

// Gives the page its launch token (see main.ts). The page reads it as
// window.owlLocal in shared/lib/firebase.ts.
const config = ipcRenderer.sendSync("owl:config") as { token: string; userName: string } | null;
if (config) contextBridge.exposeInMainWorld("owlLocal", config);
