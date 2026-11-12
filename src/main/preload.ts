import { contextBridge, ipcRenderer } from "electron";

// Gives the page its launch token (see main.ts). The page reads it as
// window.owlLocal in shared/lib/firebase.ts.
const config = ipcRenderer.sendSync("owl:config") as { token: string; userName: string } | null;
if (config) {
    contextBridge.exposeInMainWorld("owlLocal", config);

    // window.owlDesktop (ui/src/shared/lib/desktop.ts). Commands: the page
    // passes only the request id; main.ts shows the approval dialog and runs
    // the engine's own copy of the request.
    contextBridge.exposeInMainWorld("owlDesktop", {
        platform: process.platform,
        commands: {
            enabled: () => ipcRenderer.invoke("owl:commands:enabled"),
            run: (request: { requestId: string }) => ipcRenderer.invoke("owl:commands:run", request?.requestId),
        },
    });
}
