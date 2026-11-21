export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function postJsonWithRetry<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  options?: { retries?: number; timeoutMs?: number }
): Promise<ApiResponse<T>> {
  const maxRetries = options?.retries ?? 2;
  const timeoutMs = options?.timeoutMs ?? 20000;

  let lastErrorMessage = 'Unable to reach server. Please check your connection and try again.';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsed: T | null = null;
      if (rawText) {
        try {
          parsed = JSON.parse(rawText) as T;
        } catch {
          parsed = null;
        }
      }

      // Retry transient gateway/proxy responses (or HTML 502 error pages from Cloud Run)
      if (
        (TRANSIENT_HTTP_STATUSES.has(response.status) || (!response.ok && parsed === null)) &&
        attempt < maxRetries
      ) {
        lastErrorMessage = `Temporary server connection issue (HTTP ${response.status}). Retrying...`;
        await wait(350 * (attempt + 1));
        continue;
      }

      const parsedError =
        parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : undefined;

      return {
        ok: response.ok,
        status: response.status,
        data: parsed,
        errorMessage: !response.ok
          ? parsedError || `Request failed (HTTP ${response.status}). Please try again.`
          : undefined,
      };
    } catch (err) {
      lastErrorMessage =
        err instanceof Error && err.name === 'AbortError'
          ? 'Request timed out. Please check your internet connection and try again.'
          : 'Network connection interrupted. Please try again.';

      if (attempt < maxRetries) {
        await wait(350 * (attempt + 1));
        continue;
      }
    } finally {
      window.clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    errorMessage: lastErrorMessage,
  };
}
