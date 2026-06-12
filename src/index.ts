import { Bridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { login } from "./login.js";
import { Logger } from "./logger.js";
import { OpenAiClient } from "./openai-client.js";
import { SessionStore } from "./session-store.js";
import { Storage } from "./storage.js";
import { WeixinApi } from "./weixin-api.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const storage = new Storage(config.dataDir);
  const api = new WeixinApi(
    config.requestTimeoutMs,
    config.weixin.longPollTimeoutMs,
  );

  let credentials = await storage.loadCredentials();
  if (!credentials) {
    credentials = await login(api, config, logger);
    await storage.saveCredentials(credentials);
    logger.info("微信凭据已保存", {
      accountId: credentials.accountId,
      userId: credentials.userId,
    });
  }

  const state = await storage.loadState();
  const openai = new OpenAiClient(config, logger);
  const sessions = new SessionStore(
    config.openai.contextTurns,
    config.openai.systemPrompt,
  );
  const bridge = new Bridge(
    config,
    credentials,
    api,
    openai,
    sessions,
    storage,
    logger,
    state,
  );

  const controller = new AbortController();
  const stop = (signal: NodeJS.Signals) => {
    logger.info("收到退出信号", { signal });
    controller.abort(new Error(signal));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await bridge.run(controller.signal);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      message: "程序启动失败",
      error: message,
    }),
  );
  process.exitCode = 1;
});
