import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { Engine, startEngine } from "../engine/app";
import { LocalCommandRequest, LocalCommandResult, runLocalCommand, Shell } from "../engine/core/local_commands/run_command";

// The Owl desktop app: one window over the local engine (agents, workflows
// and chats in a SQLite file in the user's app-data folder, answers from
// Claude Code on this computer's Claude login).
//
// The engine listens on 127.0.0.1 only and answers nothing without a token
// made fresh at every launch, which only this app's window receives (through
// the preload script, never in a URL).

const token = randomBytes(32).toString("hex");
const userName = (() => {
    try {
        return os.userInfo().username;
    } catch {
        return "You";
    }
})();

let engine: Engine | null = null;
let win: BrowserWindow | null = null;

// The app's files: next to this file in development, inside the package once installed.
const appRoot = path.join(__dirname, "..", "..");

ipcMain.on("owl:config", (event) => {
    // Only the app's own page gets the token.
    const from = event.senderFrame?.url ?? "";
    event.returnValue = engine && from.startsWith(engine.url) ? { token, userName } : null;
});

// Commands an agent asks to run. The page only passes the request id: the
// dialog shows, and the app runs, the request exactly as the engine made it.
// Nothing runs unless the user clicks "Run" in this native dialog, which the
// page (and anything the model writes into it) can't click.
const fromAppPage = (event: Electron.IpcMainInvokeEvent) => !!engine && (event.senderFrame?.url ?? "").startsWith(engine.url);

const SHELL_LABEL: Record<Shell, string> = { powershell: "PowerShell", cmd: "Command Prompt", bash: "Bash" };

ipcMain.handle("owl:commands:enabled", (event) => fromAppPage(event));

ipcMain.handle("owl:commands:run", async (event, requestId: unknown): Promise<LocalCommandResult> => {
    if (!fromAppPage(event) || !engine) return { status: "unavailable", message: "Not allowed from this page." };
    const id = String(requestId ?? "");
    const request = engine.localCommands.get(id);
    if (!request || asking.has(id)) return { status: "unavailable", message: "This request has already been answered or was cancelled." };
    asking.add(id);
    try {
        return await askAndRun(event, id, request);
    } finally {
        asking.delete(id);
    }
});

// One dialog per request, however often the page asks.
const asking = new Set<string>();

async function askAndRun(event: Electron.IpcMainInvokeEvent, id: string, request: LocalCommandRequest): Promise<LocalCommandResult> {
    if (!engine) return { status: "unavailable", message: "The app is closing." };

    const parent = BrowserWindow.fromWebContents(event.sender) ?? win;
    const options: Electron.MessageBoxOptions = {
        type: "warning",
        title: "Run a command on this computer?",
        message: request.reason || "An agent wants to run a command on this computer.",
        detail: `${SHELL_LABEL[request.shell]} · in ${request.cwd ?? os.homedir()} · stops after ${request.timeoutMinutes} min\n\n${request.command}\n\nOnly run commands you understand. They run with your own permissions.`,
        buttons: ["Deny", "Run"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    };
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);

    // The answer may have been stopped while the dialog was open.
    if (!engine.localCommands.get(id)) return { status: "unavailable", message: "The request was cancelled before you answered." };
    if (response !== 1) {
        engine.localCommands.resolve(id, { status: "denied" });
        return { status: "denied" };
    }
    const result = await runLocalCommand(request);
    engine.localCommands.resolve(id, result);
    return result;
}

function createWindow(url: string) {
    win = new BrowserWindow({
        width: 1360,
        height: 880,
        minWidth: 900,
        minHeight: 600,
        title: "Owl",
        backgroundColor: "#f7f7f8",
        show: false,
        icon: path.join(appRoot, "assets", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });
    win.once("ready-to-show", () => win?.show());
    // Links to other sites open in the browser, never inside the app.
    win.webContents.setWindowOpenHandler(({ url: target }) => {
        if (/^https?:/i.test(target)) void shell.openExternal(target);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, target) => {
        if (!target.startsWith(url)) {
            e.preventDefault();
            if (/^https?:/i.test(target)) void shell.openExternal(target);
        }
    });
    win.on("closed", () => { win = null; });
    void win.loadURL(`${url}/chathome`);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        if (process.platform !== "darwin") Menu.setApplicationMenu(null);
        const dataDir = process.env.OWL_DATA_DIR || path.join(app.getPath("userData"), "data");
        engine = await startEngine({ dataDir, token, uiDir: path.join(appRoot, "ui", "dist"), userName, localCommands: true });
        console.log(`[owl] engine on ${engine.url}, data in ${dataDir}`);
        createWindow(engine.url);
        app.on("activate", () => {
            if (!win && engine) createWindow(engine.url);
        });
    }).catch((err) => {
        console.error("[owl] couldn't start:", err);
        app.exit(1);
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    let closing = false;
    app.on("before-quit", (e) => {
        if (closing || !engine) return;
        closing = true;
        e.preventDefault();
        void engine.close().finally(() => app.exit(0));
    });
}
