import { logLevel, type LogLevel } from "./logging";
import { isLambda } from "./runtime";

export const logPriorities: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof consoleMethods)[number];

const consoleMethodsByLevel: Record<LogLevel, ConsoleMethod> = {
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
  http: "info",
  verbose: "info",
  silly: "debug",
};

const nativeConsoleMethods = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let isConfigured = false;

export const writeConsoleLog = (level: LogLevel, ...args: unknown[]) => {
  const configuredPriority = logPriorities[logLevel];
  const consoleMethod = consoleMethodsByLevel[level];

  if (logPriorities[level] <= configuredPriority) {
    nativeConsoleMethods[consoleMethod](...args);
  }
};

export const configureConsoleLogger = () => {
  if (!isLambda() || isConfigured) {
    return;
  }

  const levelsByConsoleMethod: Record<ConsoleMethod, LogLevel> = {
    log: "info",
    info: "info",
    warn: "warn",
    error: "error",
    debug: "debug",
  };

  for (const method of consoleMethods) {
    console[method] = (...args: unknown[]) => {
      writeConsoleLog(levelsByConsoleMethod[method], ...args);
    };
  }

  isConfigured = true;
};
