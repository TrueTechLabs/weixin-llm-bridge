import path from "node:path";

import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  OPENAI_CONTEXT_TURNS: z.coerce.number().int().min(0).max(100).default(10),
  OPENAI_SYSTEM_PROMPT: z.string().default("You are a helpful assistant."),
  WEIXIN_ALLOW_FROM: z.string().min(1),
  WEIXIN_API_BASE_URL: z.string().url().default("https://ilinkai.weixin.qq.com"),
  WEIXIN_BOT_TYPE: z.string().default("3"),
  DATA_DIR: z.string().default("./data"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LONG_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(35_000),
  RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  DEDUPE_MAX_SIZE: z.coerce.number().int().min(100).default(2000),
  SEND_ERROR_MESSAGE: booleanFromString,
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }

  const values = parsed.data;
  const allowAll = values.WEIXIN_ALLOW_FROM.trim() === "*";
  const allowFrom = new Set(
    values.WEIXIN_ALLOW_FROM.split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "*"),
  );

  return {
    openai: {
      baseUrl: values.OPENAI_BASE_URL.replace(/\/+$/, ""),
      apiKey: values.OPENAI_API_KEY,
      model: values.OPENAI_MODEL,
      temperature: values.OPENAI_TEMPERATURE,
      contextTurns: values.OPENAI_CONTEXT_TURNS,
      systemPrompt: values.OPENAI_SYSTEM_PROMPT,
    },
    weixin: {
      loginBaseUrl: values.WEIXIN_API_BASE_URL.replace(/\/+$/, ""),
      botType: values.WEIXIN_BOT_TYPE,
      allowAll,
      allowFrom,
      longPollTimeoutMs: values.LONG_POLL_TIMEOUT_MS,
    },
    dataDir: path.resolve(values.DATA_DIR),
    logLevel: values.LOG_LEVEL,
    requestTimeoutMs: values.REQUEST_TIMEOUT_MS,
    retryAttempts: values.RETRY_ATTEMPTS,
    retryBaseDelayMs: values.RETRY_BASE_DELAY_MS,
    dedupeMaxSize: values.DEDUPE_MAX_SIZE,
    sendErrorMessage: values.SEND_ERROR_MESSAGE,
  };
}
