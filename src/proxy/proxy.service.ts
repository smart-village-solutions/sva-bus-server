import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CacheStatus } from '../cache/cache.service';
import { CacheService } from '../cache/cache.service';
import type { HttpClientRawResponse, HttpRequestOptions } from '../http-client/http-client.service';
import { HttpClientService } from '../http-client/http-client.service';
import { hashKeyForLogging } from '../utils/hash';
import { parseBoolean } from '../utils/parse-boolean';
import { buildProxyCacheKey, deriveProxyCachePolicy, shouldBypassProxyCache } from './proxy-cache';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly ignoreUpstreamControl: boolean;
  private readonly bypassPaths: string[];
  private readonly cacheDebug: boolean;

  constructor(
    private readonly httpClientService: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.ignoreUpstreamControl = parseBoolean(
      this.configService.get('CACHE_IGNORE_UPSTREAM_CONTROL'),
    );
    this.bypassPaths = this.parseBypassPaths(this.configService.get('CACHE_BYPASS_PATHS'));
    this.cacheDebug = parseBoolean(this.configService.get('CACHE_DEBUG'));
  }

  async forward<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<{ response: HttpClientRawResponse<T>; cacheStatus?: CacheStatus }> {
    if (method !== 'GET') {
      const response = await this.httpClientService.requestRaw<T>(method, path, body, options);
      return { response };
    }

    const basePath = this.stripQuery(path);
    if (shouldBypassProxyCache(options?.headers, basePath, this.bypassPaths)) {
      if (this.cacheDebug) {
        this.logger.debug(
          JSON.stringify({
            message: 'Proxy cache bypassed',
            method,
            path,
            basePath,
            headers: {
              accept: options?.headers?.accept,
              'accept-language': options?.headers?.['accept-language'],
              authorization: Boolean(options?.headers?.authorization),
            },
            bypassPaths: this.bypassPaths,
          }),
        );
      }
      const response = await this.httpClientService.requestRaw<T>(method, path, body, options);
      return { response, cacheStatus: 'BYPASS' };
    }

    // Cache key is based on path/query and selected headers to avoid variant mixing.
    const cacheKey = buildProxyCacheKey(method, path, options?.headers);
    const cacheKeyHash = hashKeyForLogging(cacheKey);
    if (this.cacheDebug) {
      this.logger.debug(
        JSON.stringify({
          message: 'Proxy cache lookup',
          method,
          path,
          basePath,
          cacheKeyHash,
          headers: {
            accept: options?.headers?.accept,
            'accept-language': options?.headers?.['accept-language'],
            authorization: Boolean(options?.headers?.authorization),
          },
          ignoreUpstreamControl: this.ignoreUpstreamControl,
          bypassPaths: this.bypassPaths,
        }),
      );
    }
    const cached = await this.cacheService.wrapCacheable<HttpClientRawResponse<T>>(
      cacheKey,
      async () => {
        const response = await this.httpClientService.requestRaw<T>(method, path, body, options);
        const policy = deriveProxyCachePolicy(response, {
          ignoreUpstreamControl: this.ignoreUpstreamControl,
        });
        return {
          value: response,
          cacheable: policy.cacheable,
          ttl: policy.ttlSeconds,
          staleTtl: policy.staleTtlSeconds,
        };
      },
    );

    if (this.cacheDebug) {
      this.logger.debug(
        JSON.stringify({
          message: 'Proxy cache result',
          method,
          path,
          cacheKeyHash,
          status: cached.status,
        }),
      );
    }

    return { response: cached.value, cacheStatus: cached.status };
  }

  private stripQuery(path: string): string {
    return path.split('?')[0] ?? path;
  }

  private parseBypassPaths(value: unknown): string[] {
    if (typeof value !== 'string') {
      return [];
    }
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
}
