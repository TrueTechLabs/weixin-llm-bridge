import { describe, expect, it } from "vitest";

import { MessageDedupe } from "../src/dedupe.js";

describe("MessageDedupe", () => {
  it("keeps a bounded insertion-ordered window", () => {
    const dedupe = new MessageDedupe(["1", "2"], 3);
    dedupe.add("3");
    dedupe.add("4");
    dedupe.add("4");

    expect(dedupe.values()).toEqual(["2", "3", "4"]);
    expect(dedupe.has("1")).toBe(false);
    expect(dedupe.has("4")).toBe(true);
  });
});
