import type { Config } from "./config.js";
import { MessageDedupe } from "./dedupe.js";
import type { Logger } from "./logger.js";
import { parsePrivateText, type IncomingText } from "./message.js";
import type { OpenAiClient } from "./openai-client.js";
import { retry, sleep } from "./retry.js";
import { PerKeySerialQueue } from "./serial-queue.js";
import type { SessionStore } from "./session-store.js";
import type { Storage } from "./storage.js";
import {
  TypingStatus,
  type Credentials,
  type PersistedState,
} from "./types.js";
import { HttpError } from "./http.js";
import type { WeixinApi } from "./weixin-api.js";

export class Bridge {
  private readonly queue = new PerKeySerialQueue();
  private readonly dedupe: MessageDedupe;
  private readonly typingTickets = new Map<
    string,
    { ticket: string; expiresAt: number }
  >();
  private getUpdatesBuf: string;
  private nextPollTimeoutMs: number;

  public constructor(
    private readonly config: Config,
    private readonly credentials: Credentials,
    private readonly api: WeixinApi,
    private readonly openai: OpenAiClient,
    private readonly sessions: SessionStore,
    private readonly storage: Storage,
    private readonly logger: Logger,
    state: PersistedState,
  ) {
    this.getUpdatesBuf = state.getUpdatesBuf;
    this.dedupe = new MessageDedupe(state.recentMessageIds, config.dedupeMaxSize);
    this.nextPollTimeoutMs = config.weixin.longPollTimeoutMs;
  }

  async run(signal: AbortSignal): Promise<void> {
    let failures = 0;
    this.logger.info("微信消息监听已启动", {
      accountId: this.credentials.accountId,
      baseUrl: this.credentials.baseUrl,
    });

    while (!signal.aborted) {
      try {
        const response = await this.api.getUpdates(
          this.credentials.baseUrl,
          this.credentials.token,
          this.getUpdatesBuf,
          this.nextPollTimeoutMs,
        );
        const apiCode = response.errcode || response.ret || 0;
        if (apiCode !== 0) {
          throw new Error(
            `getupdates failed: code=${apiCode} message=${response.errmsg ?? ""}`,
          );
        }
        failures = 0;
        if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
          this.nextPollTimeoutMs = response.longpolling_timeout_ms;
        }
        if (response.get_updates_buf) {
          this.getUpdatesBuf = response.get_updates_buf;
        }

        const pending: Promise<void>[] = [];
        for (const message of response.msgs ?? []) {
          const incoming = parsePrivateText(message);
          if (!incoming) continue;
          if (
            !this.config.weixin.allowAll &&
            !this.config.weixin.allowFrom.has(incoming.userId)
          ) {
            this.logger.warn("忽略不在白名单中的用户", { userId: incoming.userId });
            continue;
          }
          if (this.dedupe.has(incoming.id)) continue;
          this.dedupe.add(incoming.id);
          pending.push(
            this.queue
              .enqueue(incoming.userId, () => this.processMessage(incoming, signal))
              .catch((error) =>
              this.logger.error("消息处理失败", {
                userId: incoming.userId,
                messageId: incoming.id,
                error: error instanceof Error ? error.message : String(error),
              }),
              ),
          );
        }
        await Promise.all(pending);
        await this.persistState();
      } catch (error) {
        if (signal.aborted) break;
        failures += 1;
        const delayMs = Math.min(
          this.config.retryBaseDelayMs * 2 ** Math.min(failures - 1, 5),
          30_000,
        );
        this.logger.error("微信长轮询失败", {
          failures,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(delayMs, signal);
      }
    }
  }

  private async processMessage(incoming: IncomingText, signal: AbortSignal): Promise<void> {
    this.logger.info("收到私聊文本", {
      userId: incoming.userId,
      messageId: incoming.id,
      textLength: incoming.text.length,
    });

    if (incoming.text.toLowerCase() === "/new") {
      this.sessions.clear(incoming.userId);
      await this.send(incoming, "会话已清空。", signal);
      return;
    }

    const stopTyping = await this.startTyping(incoming);
    try {
      const messages = this.sessions.buildMessages(incoming.userId, incoming.text);
      const answer = await this.openai.complete(messages, signal);
      await this.send(incoming, answer, signal);
      this.sessions.append(incoming.userId, incoming.text, answer);
    } catch (error) {
      if (this.config.sendErrorMessage && !signal.aborted) {
        await this.send(incoming, "请求暂时失败，请稍后重试。", signal).catch(() => undefined);
      }
      throw error;
    } finally {
      await stopTyping();
    }
  }

  private async startTyping(incoming: IncomingText): Promise<() => Promise<void>> {
    const ticket = await this.getTypingTicket(incoming);
    if (!ticket) return async () => undefined;

    let stopped = false;
    let activeRequest: Promise<void> | undefined;
    const sendStatus = (status: 1 | 2): Promise<void> =>
      this.api.sendTyping(
        this.credentials.baseUrl,
        this.credentials.token,
        incoming.userId,
        ticket,
        status,
      );
    const pulse = (): void => {
      if (stopped || activeRequest) return;
      activeRequest = sendStatus(TypingStatus.TYPING)
        .catch((error) => {
          this.logger.warn("发送正在输入状态失败", {
            userId: incoming.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          activeRequest = undefined;
        });
    };

    pulse();
    const keepalive = setInterval(pulse, 5000);
    keepalive.unref();

    return async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(keepalive);
      await activeRequest;
      await sendStatus(TypingStatus.CANCEL).catch((error) => {
        this.logger.warn("取消正在输入状态失败", {
          userId: incoming.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
  }

  private async getTypingTicket(incoming: IncomingText): Promise<string> {
    const cached = this.typingTickets.get(incoming.userId);
    if (cached && cached.expiresAt > Date.now()) return cached.ticket;

    try {
      const response = await this.api.getConfig(
        this.credentials.baseUrl,
        this.credentials.token,
        incoming.userId,
        incoming.contextToken,
      );
      if (response.ret !== undefined && response.ret !== 0) {
        throw new Error(
          `getconfig failed: ret=${response.ret} message=${response.errmsg ?? ""}`,
        );
      }
      const ticket = response.typing_ticket ?? "";
      if (ticket) {
        this.typingTickets.set(incoming.userId, {
          ticket,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
      }
      return ticket;
    } catch (error) {
      this.logger.warn("获取正在输入凭据失败", {
        userId: incoming.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return "";
    }
  }

  private send(
    incoming: IncomingText,
    text: string,
    signal: AbortSignal,
  ): Promise<void> {
    return retry(
      () =>
        this.api.sendText(
          this.credentials.baseUrl,
          this.credentials.token,
          incoming.userId,
          text,
          incoming.contextToken,
        ),
      {
        attempts: this.config.retryAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
        signal,
        shouldRetry: (error) =>
          !(error instanceof HttpError) ||
          error.status === 408 ||
          error.status === 409 ||
          error.status === 429 ||
          error.status >= 500,
        onRetry: (error, attempt, delayMs) =>
          this.logger.warn("微信回复失败，准备重试", {
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          }),
      },
    );
  }

  private persistState(): Promise<void> {
    return this.storage.saveState({
      getUpdatesBuf: this.getUpdatesBuf,
      recentMessageIds: this.dedupe.values(),
    });
  }
}
