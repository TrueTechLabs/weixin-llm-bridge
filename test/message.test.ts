import { describe, expect, it } from "vitest";

import { parsePrivateText } from "../src/message.js";

describe("parsePrivateText", () => {
  it("parses a private user text message", () => {
    expect(
      parsePrivateText({
        message_id: 42,
        from_user_id: "user-1",
        message_type: 1,
        item_list: [{ type: 1, text_item: { text: " hello " } }],
        context_token: "ctx",
      }),
    ).toEqual({
      id: "42",
      userId: "user-1",
      text: "hello",
      contextToken: "ctx",
    });
  });

  it("ignores groups, bot messages, and non-text messages", () => {
    expect(
      parsePrivateText({
        from_user_id: "user-1",
        group_id: "group",
        message_type: 1,
        item_list: [{ type: 1, text_item: { text: "hello" } }],
      }),
    ).toBeUndefined();
    expect(
      parsePrivateText({
        from_user_id: "user-1",
        message_type: 2,
        item_list: [{ type: 1, text_item: { text: "hello" } }],
      }),
    ).toBeUndefined();
    expect(
      parsePrivateText({
        from_user_id: "user-1",
        message_type: 1,
        item_list: [{ type: 2 }],
      }),
    ).toBeUndefined();
  });
});
