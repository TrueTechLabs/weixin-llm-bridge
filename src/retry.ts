export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < options.attempts && (options.shouldRetry?.(error) ?? true);
      if (!canRetry) throw error;
      const delayMs = options.baseDelayMs * 2 ** (attempt - 1);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }
  throw lastError;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}
