import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestInit, Response as UndiciResponse } from 'undici';
import { Agent, fetch } from 'undici';

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface HttpClientRawResponse<T> {
  status: number;
  body: T | null;
  contentType: string | null;
  headers: Record<string, string>;
}

interface HttpError extends Error {
  status?: number;
  responseBody?: unknown;
}

@Injectable()
export class HttpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;
  private readonly dispatcher: Agent;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('HTTP_CLIENT_BASE_URL') ?? '';
    this.defaultTimeoutMs = this.normalizeTimeoutMs(
      this.configService.get('HTTP_CLIENT_TIMEOUT'),
      10000,
    );
    this.defaultRetries = this.normalizeRetries(this.configService.get('HTTP_CLIENT_RETRIES'), 2);
    this.dispatcher = new Agent({
      connections: 50,
      pipelining: 0,
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 60_000,
    });
  }

  async get<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close();
  }

  /**
   * Perform a request and return the raw status/body so callers (e.g. the proxy)
   * can forward upstream errors without converting them into exceptions.
   * Retries are limited to idempotent GET requests and only for retryable failures.
   * We keep the lastResponse so if the upstream replied (even with 4xx/5xx) we can
   * return that response after retries; only the final non-retryable error causes a throw
   * when no valid response is available.
   */
  async requestRaw<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpClientRawResponse<T>> {
    const url = this.buildUrl(path, options?.query);
    const timeoutMs = this.normalizeTimeoutMs(options?.timeoutMs, this.defaultTimeoutMs);
    const retries = this.normalizeRetries(options?.retries, this.defaultRetries);
    const effectiveRetries = method === 'GET' ? retries : 0;
    let lastError: unknown;
    let lastResponse: HttpClientRawResponse<T> | null = null;

    for (let attempt = 0; attempt <= effectiveRetries; attempt += 1) {
      try {
        const response = await this.executeRequest<T>(method, url, body, options, timeoutMs);
        const rawResponse = {
          status: response.status,
          body: response.body,
          contentType: response.contentType,
          headers: response.headers,
        } as HttpClientRawResponse<T>;

        if (response.ok) {
          return rawResponse;
        }

        lastResponse = rawResponse;
        if (response.status >= 500 && response.status < 600 && attempt < effectiveRetries) {
          this.logger.warn(
            `HTTP ${method} ${url} failed with status ${response.status} (attempt ${attempt + 1}/${effectiveRetries + 1}). Retrying.`,
          );
          continue;
        }

        return rawResponse;
      } catch (error) {
        lastError = error;
        const shouldRetry = this.isRetryableError(error);

        if (attempt >= effectiveRetries || !shouldRetry) {
          break;
        }
        this.logger.warn(
          `HTTP ${method} ${url} failed (attempt ${attempt + 1}/${effectiveRetries + 1}). Retrying.`,
        );
      }
    }

    if (lastError && !this.isRetryableError(lastError)) {
      throw lastError;
    }

    if (lastResponse) {
      return lastResponse;
    }

    throw lastError;
  }

  /**
   * Perform a request that throws on non-2xx responses so callers can rely on
   * exceptions for error handling. Retries are limited to idempotent GET requests
   * and only for retryable failures.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);
    const timeoutMs = this.normalizeTimeoutMs(options?.timeoutMs, this.defaultTimeoutMs);
    const retries = this.normalizeRetries(options?.retries, this.defaultRetries);
    const effectiveRetries = method === 'GET' ? retries : 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= effectiveRetries; attempt += 1) {
      try {
        const response = await this.executeRequest<T>(method, url, body, options, timeoutMs);

        if (!response.ok) {
          const error = new Error(
            `Upstream request failed with status ${response.status}`,
          ) as HttpError;
          error.status = response.status;
          error.responseBody = response.body;
          throw error;
        }

        return response.body as T;
      } catch (error) {
        lastError = error;
        const shouldRetry = this.isRetryableError(error);

        if (attempt >= effectiveRetries || !shouldRetry) {
          break;
        }
        this.logger.warn(
          `HTTP ${method} ${url} failed (attempt ${attempt + 1}/${effectiveRetries + 1}). Retrying.`,
        );
      }
    }

    // Log error once at the end
    const httpError = lastError as HttpError;
    if (httpError?.status) {
      this.logger.error(
        httpError.message,
        JSON.stringify({
          url,
          method,
          status: httpError.status,
          responseBody: httpError.responseBody,
        }),
      );
    } else {
      this.logger.error(
        httpError?.message ?? 'Upstream request failed',
        JSON.stringify({ url, method }),
      );
    }

    throw lastError;
  }

  private async executeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    options: HttpRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<{
    status: number;
    ok: boolean;
    body: T | null;
    contentType: string | null;
    headers: Record<string, string>;
  }> {
    const controller = new AbortController();
    const signal = this.attachAbortSignal(controller, options?.signal);

    const response = await this.fetchWithTimeout(
      url,
      {
        method,
        headers: this.buildHeaders(options?.headers, body),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        dispatcher: this.dispatcher,
      },
      timeoutMs,
      controller,
    );

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = await this.parseResponseBody(response, contentType);
    const responseHeaders = this.extractForwardHeaders(response);

    return {
      status: response.status,
      ok: response.ok,
      body: responseBody as T | null,
      contentType: contentType.length > 0 ? contentType : null,
      headers: responseHeaders,
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit & { signal: AbortSignal },
    timeoutMs: number,
    controller: AbortController,
  ) {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Request timed out'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fetch(url, init), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private attachAbortSignal(controller: AbortController, signal?: AbortSignal): AbortSignal {
    if (!signal) {
      return controller.signal;
    }

    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }

    signal.addEventListener('abort', () => controller.abort(), { once: true });
    return controller.signal;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      throw new Error('Absolute proxy URLs are not allowed');
    }

    if (!this.baseUrl) {
      throw new Error('HTTP client base URL is not configured properly');
    }

    const baseUrl = new URL(this.baseUrl);
    if (baseUrl.pathname && baseUrl.pathname !== '/') {
      throw new Error('HTTP client base URL must not include a path');
    }
    const url = new URL(path, baseUrl);

    if (url.origin !== baseUrl.origin) {
      throw new Error('Proxy path resolves outside the configured base URL');
    }

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Determines whether an error is retryable based on its type and HTTP status code.
   *
   * @param error - The error to evaluate for retry eligibility
   * @returns `true` if the error should be retried, `false` otherwise
   *
   * @remarks
   * The following errors are NOT retryable:
   * - Non-object or null values
   * - `SyntaxError` instances (parsing errors)
   * - `AbortError` (user-initiated cancellations)
   * - 4xx client errors (400-499) - these indicate client-side issues
   *
   * The following errors ARE retryable:
   * - 5xx server errors (500-599) - temporary server issues
   * - Network errors without status codes (connection failures, timeouts, etc.)
   */
  private isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    if (error instanceof SyntaxError) {
      return false;
    }

    const httpError = error as HttpError & { name?: string };

    if (httpError.name === 'AbortError') {
      return false;
    }

    // Status may be missing or not a number (e.g. network errors, foreign error objects).
    // We explicitly check for number so the retry logic only evaluates actual HTTP status codes.
    const status = httpError.status;

    // Don't retry 4xx client errors (400-499)
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return false;
    }

    // Retry 5xx server errors (500-599)
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true;
    }

    // Retry network errors, timeouts, and other transient failures
    // (these won't have a status property)
    return typeof status !== 'number';
  }

  private buildHeaders(
    headers: Record<string, string> | undefined,
    body: unknown,
  ): Record<string, string> {
    if (body === undefined) {
      return headers ?? {};
    }

    return {
      ...(headers ?? {}),
      'content-type': 'application/json',
    };
  }

  private async parseResponseBody(
    response: UndiciResponse,
    contentType: string,
  ): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch (error) {
        this.logger.warn('Failed to parse upstream JSON response, returning raw text instead.');
        return text;
      }
    }

    return text;
  }

  private extractForwardHeaders(response: UndiciResponse): Record<string, string> {
    const allowlistedHeaders = [
      'cache-control',
      'etag',
      'last-modified',
      'expires',
      'vary',
      'content-encoding',
      'content-language',
      'content-disposition',
    ];
    return allowlistedHeaders.reduce<Record<string, string>>((acc, header) => {
      const value = response.headers.get(header);
      if (value) {
        acc[header] = value;
      }
      return acc;
    }, {});
  }

  private normalizeTimeoutMs(value: unknown, fallback: number): number {
    const candidate = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      return fallback;
    }
    return Math.floor(candidate);
  }

  private normalizeRetries(value: unknown, fallback: number): number {
    const candidate = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(candidate) || candidate < 0) {
      return fallback;
    }
    return Math.floor(candidate);
  }
}
