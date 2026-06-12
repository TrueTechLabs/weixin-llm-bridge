import readline from "node:readline/promises";

import qrcodeTerminal from "qrcode-terminal";

import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { sleep } from "./retry.js";
import type { Credentials } from "./types.js";
import type { WeixinApi } from "./weixin-api.js";

const LOGIN_TIMEOUT_MS = 8 * 60_000;
const MAX_QR_REFRESHES = 3;

async function readVerifyCode(): Promise<string> {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await terminal.question("请输入手机微信显示的数字：")).trim();
  } finally {
    terminal.close();
  }
}

function displayQr(url: string): void {
  qrcodeTerminal.generate(url, { small: true });
  process.stdout.write(`二维码备用链接：${url}\n`);
}

export async function login(
  api: WeixinApi,
  config: Config,
  logger: Logger,
  previousToken?: string,
): Promise<Credentials> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let refreshCount = 0;
  let pollingBaseUrl = config.weixin.loginBaseUrl;
  let verifyCode: string | undefined;

  let qr = await api.getQrCode(
    config.weixin.loginBaseUrl,
    config.weixin.botType,
    previousToken ? [previousToken] : [],
  );
  displayQr(qr.qrcode_img_content);
  logger.info("等待微信扫码登录");

  while (Date.now() < deadline) {
    const status = await api.getQrStatus(pollingBaseUrl, qr.qrcode, verifyCode);
    switch (status.status) {
      case "wait":
        break;
      case "scaned":
        verifyCode = undefined;
        logger.info("二维码已扫描，等待手机确认");
        break;
      case "need_verifycode":
        verifyCode = await readVerifyCode();
        continue;
      case "scaned_but_redirect":
        if (status.redirect_host) {
          pollingBaseUrl = `https://${status.redirect_host}`;
          logger.info("扫码状态切换至指定区域");
        }
        break;
      case "confirmed": {
        if (!status.bot_token || !status.ilink_bot_id) {
          throw new Error("微信登录响应缺少 token 或 account id");
        }
        return {
          token: status.bot_token,
          accountId: status.ilink_bot_id,
          baseUrl: (status.baseurl ?? pollingBaseUrl).replace(/\/+$/, ""),
          ...(status.ilink_user_id ? { userId: status.ilink_user_id } : {}),
          savedAt: new Date().toISOString(),
        };
      }
      case "binded_redirect":
        throw new Error("该微信账号已绑定，但服务端未返回新凭据；请保留并使用原 credentials.json");
      case "expired":
      case "verify_code_blocked":
        refreshCount += 1;
        if (refreshCount >= MAX_QR_REFRESHES) {
          throw new Error("二维码已多次失效，请稍后重新启动");
        }
        verifyCode = undefined;
        pollingBaseUrl = config.weixin.loginBaseUrl;
        qr = await api.getQrCode(
          config.weixin.loginBaseUrl,
          config.weixin.botType,
          previousToken ? [previousToken] : [],
        );
        displayQr(qr.qrcode_img_content);
        logger.warn("二维码已刷新，请重新扫描");
        break;
    }
    await sleep(1000);
  }

  throw new Error("微信扫码登录超时");
}
