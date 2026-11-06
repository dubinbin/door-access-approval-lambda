import { format } from "date-fns";
import winston from "winston";
import WinstonCloudWatch from "winston-cloudwatch";
import { logLevel, type LogLevel } from "./logging.js";
import { writeConsoleLog } from "./consoleLogger.js";
import { isLambda } from "./runtime.js";

type LogEntry = {
  level: LogLevel;
  message: string;
  [key: string]: unknown;
};

export type MiddlewareLogger = Record<LogLevel, (message: unknown, ...metadata: unknown[]) => void> & {
  log(level: LogLevel, message: unknown, ...metadata: unknown[]): void;
  log(entry: LogEntry): void;
};
const createLambdaLogger = (name: string): MiddlewareLogger => {
  const atLevel = (level: LogLevel) => (message: unknown, ...metadata: unknown[]) =>
    writeConsoleLog(level, `[${name}]`, message, ...metadata);

  const log = (levelOrEntry: LogLevel | LogEntry, ...args: unknown[]) => {
    if (typeof levelOrEntry === "object") {
      const { level, message, ...metadata } = levelOrEntry;
      writeConsoleLog(level, `[${name}]`, message, ...(Object.keys(metadata).length > 0 ? [metadata] : []));
      return;
    }
    writeConsoleLog(levelOrEntry, `[${name}]`, ...args);
  };

  return {
    error: atLevel("error"),
    warn: atLevel("warn"),
    info: atLevel("info"),
    http: atLevel("http"),
    verbose: atLevel("verbose"),
    debug: atLevel("debug"),
    silly: atLevel("silly"),
    log,
  };
};

export const createMiddlewareLogger = ({ name, logGroupName }: { name: string; logGroupName: string }): MiddlewareLogger => {
  if (isLambda()) {
    return createLambdaLogger(name);
  }

  return winston.createLogger({
    level: logLevel,
    format: winston.format((info) => {
      info.message = `[${name}] ${info.message}`;
      return info;
    })(),
    transports: [
      new WinstonCloudWatch({
        name,
        logGroupName,
        logStreamName: () => `${format(new Date(), "yyyy-MM-dd")}/${process.env.APP_ENV}`,
        retentionInDays: 180,
        awsRegion: process.env.SITE_AWS_REGION,
      }),
    ],
  });
};
