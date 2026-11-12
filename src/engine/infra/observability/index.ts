// The server edition exports Prometheus metrics; the desktop app only logs.
const counter = { inc: (_labels?: Record<string, string>) => {} };

export const metrics = { flowNodes: counter };
export const logger = console;
