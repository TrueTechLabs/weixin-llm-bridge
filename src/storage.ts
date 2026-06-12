import fs from "node:fs/promises";
import path from "node:path";

import type { Credentials, PersistedState } from "./types.js";

const EMPTY_STATE: PersistedState = { getUpdatesBuf: "", recentMessageIds: [] };

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporaryPath, filePath);
}

export class Storage {
  private readonly credentialsPath: string;
  private readonly statePath: string;

  public constructor(dataDir: string) {
    this.credentialsPath = path.join(dataDir, "credentials.json");
    this.statePath = path.join(dataDir, "state.json");
  }

  loadCredentials(): Promise<Credentials | undefined> {
    return readJson<Credentials>(this.credentialsPath);
  }

  saveCredentials(credentials: Credentials): Promise<void> {
    return writeJsonAtomic(this.credentialsPath, credentials);
  }

  async loadState(): Promise<PersistedState> {
    return (await readJson<PersistedState>(this.statePath)) ?? { ...EMPTY_STATE };
  }

  saveState(state: PersistedState): Promise<void> {
    return writeJsonAtomic(this.statePath, state);
  }
}
