export class MessageDedupe {
  private readonly ids: Set<string>;

  public constructor(
    initialIds: string[],
    private readonly maxSize: number,
  ) {
    this.ids = new Set(initialIds.slice(-maxSize));
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    while (this.ids.size > this.maxSize) {
      const oldest = this.ids.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.ids.delete(oldest);
    }
  }

  values(): string[] {
    return [...this.ids];
  }
}
