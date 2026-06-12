import type { ChatMessage } from "./types.js";

export class SessionStore {
  private readonly sessions = new Map<string, ChatMessage[]>();

  public constructor(
    private readonly contextTurns: number,
    private readonly systemPrompt: string,
  ) {}

  buildMessages(userId: string, userText: string): ChatMessage[] {
    const history = this.sessions.get(userId) ?? [];
    return [
      ...(this.systemPrompt
        ? [{ role: "system" as const, content: this.systemPrompt }]
        : []),
      ...history,
      { role: "user", content: userText } as const,
    ];
  }

  append(userId: string, userText: string, assistantText: string): void {
    if (this.contextTurns === 0) return;
    const history = this.sessions.get(userId) ?? [];
    history.push(
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    );
    this.sessions.set(userId, history.slice(-this.contextTurns * 2));
  }

  clear(userId: string): void {
    this.sessions.delete(userId);
  }
}
