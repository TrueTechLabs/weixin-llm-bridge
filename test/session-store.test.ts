import { describe, expect, it } from "vitest";

import { SessionStore } from "../src/session-store.js";

describe("SessionStore", () => {
  it("retains only the configured number of turns", () => {
    const store = new SessionStore(2, "system");
    store.append("u", "q1", "a1");
    store.append("u", "q2", "a2");
    store.append("u", "q3", "a3");

    expect(store.buildMessages("u", "q4")).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "q3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "q4" },
    ]);
  });

  it("clears one user without affecting another", () => {
    const store = new SessionStore(2, "");
    store.append("a", "qa", "aa");
    store.append("b", "qb", "ab");
    store.clear("a");

    expect(store.buildMessages("a", "new")).toEqual([
      { role: "user", content: "new" },
    ]);
    expect(store.buildMessages("b", "next")).toHaveLength(3);
  });
});
