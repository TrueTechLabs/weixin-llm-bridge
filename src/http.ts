export class HttpError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function safeErrorBody(body: string): string {
  const redacted = body
    .replace(
      /"(api[_-]?key|authorization|token|bot_token|context_token|typing_ticket)"\s*:\s*"[^"]*"/gi,
      '"$1":"<redacted>"',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer <redacted>");
  return redacted.length > 500
    ? `${redacted.slice(0, 500)}...(truncated)`
    : redacted;
}

export async function fetchText(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(url, { ...init, signal });
  const body = await response.text();
  if (!response.ok) {
    const safeBody = safeErrorBody(body);
    throw new HttpError(
      `HTTP ${response.status}${safeBody ? `: ${safeBody}` : ""}`,
      response.status,
      safeBody,
    );
  }
  return body;
}
