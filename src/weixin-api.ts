import crypto from "node:crypto";

import { fetchText } from "./http.js";
import type {
  BaseInfo,
  GetConfigResponse,
  GetUpdatesResponse,
  WeixinMessage,
} from "./types.js";

const APP_ID = "bot";
const CLIENT_VERSION = 0x00010000;
const LIGHTWEIGHT_TIMEOUT_MS = 10_000;

function joinUrl(baseUrl: string, endpoint: string): string {
  return new URL(endpoint, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function randomWechatUin(): string {
  const value = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(value), "utf8").toString("base64");
}

function commonHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": APP_ID,
    "iLink-App-ClientVersion": String(CLIENT_VERSION),
  };
}

function authenticatedHeaders(token: string): Record<string, string> {
  return {
    ...commonHeaders(),
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "X-WECHAT-UIN": randomWechatUin(),
  };
}

function baseInfo(): BaseInfo {
  return {
    channel_version: "0.1.0",
    bot_agent: "weixin-llm-bridge/0.1.0",
  };
}

export interface QrCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export type QrStatus =
  | "wait"
  | "scaned"
  | "confirmed"
  | "expired"
  | "scaned_but_redirect"
  | "need_verifycode"
  | "verify_code_blocked"
  | "binded_redirect";

export interface QrStatusResponse {
  status: QrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}

export class WeixinApi {
  public constructor(
    private readonly requestTimeoutMs: number,
    private readonly longPollTimeoutMs: number,
  ) {}

  async getQrCode(
    baseUrl: string,
    botType: string,
    localTokenList: string[] = [],
  ): Promise<QrCodeResponse> {
    const body = await fetchText(
      joinUrl(
        baseUrl,
        `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
      ),
      {
        method: "POST",
        headers: { ...commonHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ local_token_list: localTokenList.slice(0, 10) }),
      },
      this.requestTimeoutMs,
    );
    return JSON.parse(body) as QrCodeResponse;
  }

  async getQrStatus(
    baseUrl: string,
    qrcode: string,
    verifyCode?: string,
  ): Promise<QrStatusResponse> {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    try {
      const body = await fetchText(
        joinUrl(baseUrl, `ilink/bot/get_qrcode_status?${query.toString()}`),
        { method: "GET", headers: commonHeaders() },
        this.longPollTimeoutMs,
      );
      return JSON.parse(body) as QrStatusResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return { status: "wait" };
      }
      throw error;
    }
  }

  async getUpdates(
    baseUrl: string,
    token: string,
    getUpdatesBuf: string,
    timeoutMs = this.longPollTimeoutMs,
  ): Promise<GetUpdatesResponse> {
    try {
      const body = await fetchText(
        joinUrl(baseUrl, "ilink/bot/getupdates"),
        {
          method: "POST",
          headers: authenticatedHeaders(token),
          body: JSON.stringify({
            get_updates_buf: getUpdatesBuf,
            base_info: baseInfo(),
          }),
        },
        timeoutMs,
      );
      return JSON.parse(body) as GetUpdatesResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
      }
      throw error;
    }
  }

  async sendText(
    baseUrl: string,
    token: string,
    to: string,
    text: string,
    contextToken?: string,
  ): Promise<void> {
    const message: WeixinMessage = {
      from_user_id: "",
      to_user_id: to,
      client_id: `weixin-llm-bridge:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      ...(contextToken ? { context_token: contextToken } : {}),
    };
    await fetchText(
      joinUrl(baseUrl, "ilink/bot/sendmessage"),
      {
        method: "POST",
        headers: authenticatedHeaders(token),
        body: JSON.stringify({ msg: message, base_info: baseInfo() }),
      },
      this.requestTimeoutMs,
    );
  }

  async getConfig(
    baseUrl: string,
    token: string,
    userId: string,
    contextToken?: string,
  ): Promise<GetConfigResponse> {
    const body = await fetchText(
      joinUrl(baseUrl, "ilink/bot/getconfig"),
      {
        method: "POST",
        headers: authenticatedHeaders(token),
        body: JSON.stringify({
          ilink_user_id: userId,
          ...(contextToken ? { context_token: contextToken } : {}),
          base_info: baseInfo(),
        }),
      },
      Math.min(this.requestTimeoutMs, LIGHTWEIGHT_TIMEOUT_MS),
    );
    return JSON.parse(body) as GetConfigResponse;
  }

  async sendTyping(
    baseUrl: string,
    token: string,
    userId: string,
    typingTicket: string,
    status: 1 | 2,
  ): Promise<void> {
    await fetchText(
      joinUrl(baseUrl, "ilink/bot/sendtyping"),
      {
        method: "POST",
        headers: authenticatedHeaders(token),
        body: JSON.stringify({
          ilink_user_id: userId,
          typing_ticket: typingTicket,
          status,
          base_info: baseInfo(),
        }),
      },
      Math.min(this.requestTimeoutMs, LIGHTWEIGHT_TIMEOUT_MS),
    );
  }
}
