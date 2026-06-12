const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type LogLevel = keyof typeof LEVELS;

const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|token|bot_token|context_token|typing_ticket|qrcode|verify_code)$/i;

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "<redacted>";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    );
  }
  return value;
}

export class Logger {
  public constructor(private readonly level: LogLevel) {}

  private write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.write("error", message, fields);
  }
}
