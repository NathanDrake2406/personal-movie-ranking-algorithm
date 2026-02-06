type LogContext = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  msg: string,
  context?: LogContext,
) {
  const entry = { level, msg, ts: new Date().toISOString(), ...context };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (msg: string, context?: LogContext) => emit("info", msg, context),
  warn: (msg: string, context?: LogContext) => emit("warn", msg, context),
  error: (msg: string, context?: LogContext) => emit("error", msg, context),
};
