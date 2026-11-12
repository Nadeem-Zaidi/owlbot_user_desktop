import { randomBytes } from "node:crypto";
import path from "node:path";
import { startEngine } from "./app";

// The engine without the desktop window, for development and tests:
//   npm run engine   → prints the address and the token to call it with.
// OWL_DATA_DIR picks the data folder (default ./data), OWL_PORT the port.
(async () => {
    const token = process.env.OWL_TOKEN || randomBytes(24).toString("hex");
    const engine = await startEngine({
        dataDir: path.resolve(process.env.OWL_DATA_DIR || "data"),
        token,
        port: Number(process.env.OWL_PORT) || 0,
        uiDir: process.env.OWL_UI_DIR,
    });
    console.log(`OWL_ENGINE_READY ${engine.url} ${token}`);
    const stop = () => void engine.close().then(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
})().catch((err) => {
    console.error("The engine couldn't start:", err);
    process.exit(1);
});
