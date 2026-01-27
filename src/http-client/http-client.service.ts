import { Injectable, Logger } from '@nestjs/common';
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
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;
  private readonly dispatcher: Agent;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('HTTP_CLIENT_BASE_URL') ?? '';
    this.defaultTimeoutMs = Number(this.configService.get('HTTP_CLIENT_TIMEOUT') ?? 10000);
    this.defaultRetries = Number(this.configService.get('HTTP_CLIENT_RETRIES') ?? 2);
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

  async requestRaw<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpClientRawResponse<T>> {
    const url = this.buildUrl(path, options?.query);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const retries = options?.retries ?? this.defaultRetries;
    const effectiveRetries = method === 'GET' ? retries : 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= effectiveRetries; attempt += 1) {
      try {
        const response = await this.executeRequest<T>(method, url, body, options, timeoutMs);
        return { status: response.status, body: response.body };
      } catch (error) {
        lastError = error;
        if (attempt >= effectiveRetries) {
          break;
        }
        this.logger.warn(
          `HTTP ${method} ${url} failed (attempt ${attempt + 1}/${effectiveRetries + 1}). Retrying.`,
        );
      }
    }

    throw lastError;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const retries = options?.retries ?? this.defaultRetries;
    const effectiveRetries = method === 'GET' ? retries : 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= effectiveRetries; attempt += 1) {
      try {
        const response = await this.executeRequest<T>(method, url, body, options, timeoutMs);

        if (!response.ok) {
          const errorMessage = `Upstream request failed with status ${response.status}`;
          const error = new Error(errorMessage);
          this.logger.error(
            errorMessage,
            JSON.stringify({ url, method, responseBody: response.body }),
          );
          throw error;
        }

        return response.body as T;
      } catch (error) {
        lastError = error;
        if (attempt >= effectiveRetries) {
          break;
        }
        this.logger.warn(
          `HTTP ${method} ${url} failed (attempt ${attempt + 1}/${effectiveRetries + 1}). Retrying.`,
        );
      }
    }

    throw lastError;
  }

  private async executeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    options: HttpRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; ok: boolean; body: T | null }> {
    const controller = new AbortController();
    const signal = this.attachAbortSignal(controller, options?.signal);

    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method,
          headers: this.buildHeaders(options?.headers, body),
          body: body ? JSON.stringify(body) : undefined,
          signal,
          dispatcher: this.dispatcher,
        },
        timeoutMs,
        controller,
      );

      const responseBody = await this.parseResponseBody(response);

      return { status: response.status, ok: response.ok, body: responseBody as T | null };
    } catch (error) {
      this.logger.error('Upstream request failed', JSON.stringify({ url, method }));
      throw error;
    }
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
    if (!this.baseUrl && !path.startsWith('http://') && !path.startsWith('https://')) {
      throw new Error('HTTP client base URL is not configured');
    }

    const url = this.baseUrl ? new URL(path, this.baseUrl) : new URL(path);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private buildHeaders(
    headers: Record<string, string> | undefined,
    body: unknown,
  ): Record<string, string> {
    if (!body) {
      return headers ?? {};
    }

    return {
      'content-type': 'application/json',
      ...(headers ?? {}),
    };
  }

  private async parseResponseBody(response: UndiciResponse): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    if (!text) {
      return null;
    }

    if (contentType.includes('application/json')) {
      return JSON.parse(text);
    }

    return text;
  }
}
