import { describe, expect, it } from "vitest";

import { PerKeySerialQueue } from "../src/serial-queue.js";

describe("PerKeySerialQueue", () => {
  it("serializes tasks for the same key", async () => {
    const queue = new PerKeySerialQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue("user", async () => {
      events.push("first:start");
      await gate;
      events.push("first:end");
    });
    const second = queue.enqueue("user", async () => {
      events.push("second");
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });
});
