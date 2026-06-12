import fs from "node:fs/promises";
import path from "node:path";

const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 30_000;

interface LockOwner {
  pid: number;
  hostname: string;
  startedAt: string;
}

export class InstanceLock {
  private heartbeat?: NodeJS.Timeout;
  private released = false;

  private constructor(private readonly lockDir: string) {}

  static async acquire(dataDir: string): Promise<InstanceLock> {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const lockDir = path.join(dataDir, ".instance-lock");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await fs.mkdir(lockDir, { mode: 0o700 });
        const lock = new InstanceLock(lockDir);
        await lock.writeOwner();
        lock.startHeartbeat();
        return lock;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!(await isStale(lockDir))) {
          const owner = await readOwner(lockDir);
          const detail = owner
            ? `pid=${owner.pid}, host=${owner.hostname}, startedAt=${owner.startedAt}`
            : "owner unknown";
          throw new Error(
            `已有实例正在使用 DATA_DIR（${detail}）。请先停止旧进程或容器。`,
          );
        }
        await fs.rm(lockDir, { recursive: true, force: true });
      }
    }

    throw new Error("无法获取单实例锁");
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    await fs.rm(this.lockDir, { recursive: true, force: true });
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      void this.touch().catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  private async writeOwner(): Promise<void> {
    const owner: LockOwner = {
      pid: process.pid,
      hostname: process.env.HOSTNAME ?? "localhost",
      startedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(this.lockDir, "owner.json"),
      `${JSON.stringify(owner)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  private async touch(): Promise<void> {
    const now = new Date();
    await fs.utimes(this.lockDir, now, now);
  }
}

async function isStale(lockDir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockDir);
    return Date.now() - stat.mtimeMs >= STALE_AFTER_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

async function readOwner(lockDir: string): Promise<LockOwner | undefined> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(lockDir, "owner.json"), "utf8"),
    ) as LockOwner;
  } catch {
    return undefined;
  }
}
