import { afterEach, describe, expect, it, vi } from "vitest";

import { WeixinApi } from "../src/weixin-api.js";

describe("WeixinApi typing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gets a typing ticket and sends typing statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ret: 0, typing_ticket: "ticket" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new WeixinApi(60_000, 35_000);
    await expect(
      api.getConfig("https://weixin.test", "secret", "user", "context"),
    ).resolves.toEqual({ ret: 0, typing_ticket: "ticket" });
    await api.sendTyping(
      "https://weixin.test",
      "secret",
      "user",
      "ticket",
      1,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://weixin.test/ilink/bot/getconfig",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      ilink_user_id: "user",
      context_token: "context",
    });
    expect(
      JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({
      ilink_user_id: "user",
      typing_ticket: "ticket",
      status: 1,
    });
  });
});
