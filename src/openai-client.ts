import type { Config } from "./config.js";
import { fetchText, HttpError } from "./http.js";
import type { Logger } from "./logger.js";
import { retry } from "./retry.js";
import type { ChatMessage } from "./types.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function extractContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("")
      .trim();
  }
  throw new Error(response.error?.message ?? "OpenAI-compatible response has no text content");
}

export class OpenAiClient {
  public constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    return retry(
      async () => {
        const raw = await fetchText(
          `${this.config.openai.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.openai.apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.openai.model,
              messages,
              temperature: this.config.openai.temperature,
            }),
            ...(signal ? { signal } : {}),
          },
          this.config.requestTimeoutMs,
        );
        return extractContent(JSON.parse(raw) as ChatCompletionResponse);
      },
      {
        attempts: this.config.retryAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
        ...(signal ? { signal } : {}),
        shouldRetry: (error) =>
          !(error instanceof HttpError) ||
          error.status === 408 ||
          error.status === 409 ||
          error.status === 429 ||
          error.status >= 500,
        onRetry: (error, attempt, delayMs) =>
          this.logger.warn("模型请求失败，准备重试", {
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          }),
      },
    );
  }
}
