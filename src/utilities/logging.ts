export const logLevels = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
] as const;

export type LogLevel = (typeof logLevels)[number];

const isLogLevel = (value: string): value is LogLevel =>
  logLevels.some((level) => level === value);

const configuredLogLevel = process.env.LOG_LEVEL?.toLowerCase() || "info";

export const logLevel: LogLevel = isLogLevel(configuredLogLevel)
  ? configuredLogLevel
  : "info";
