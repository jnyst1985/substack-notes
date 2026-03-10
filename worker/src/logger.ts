type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  const entry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
};
