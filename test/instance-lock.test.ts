import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InstanceLock } from "../src/instance-lock.js";

const temporaryDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("InstanceLock", () => {
  it("rejects a second instance and permits it after release", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "weixin-lock-"));
    temporaryDirs.push(dataDir);

    const first = await InstanceLock.acquire(dataDir);
    await expect(InstanceLock.acquire(dataDir)).rejects.toThrow(
      "已有实例正在使用 DATA_DIR",
    );

    await first.release();
    const second = await InstanceLock.acquire(dataDir);
    await second.release();
  });
});
