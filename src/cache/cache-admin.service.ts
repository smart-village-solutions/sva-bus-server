import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { buildProxyCacheKey } from '../proxy/proxy-cache';
import { CacheService } from './cache.service';

const PROXY_GET_CACHE_KEY_PREFIX = 'proxy:GET:';
const SCAN_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 100;

export type CacheInvalidationScope = 'exact' | 'prefix' | 'all';

export type StrictCacheKeyHeaders = {
  accept?: string;
  acceptLanguage?: string;
  apiKey?: string;
};

export type InvalidateExactInput = {
  scope: 'exact';
  path: string;
  strict?: boolean;
  headers?: StrictCacheKeyHeaders;
  dryRun?: boolean;
};

export type InvalidatePrefixInput = {
  scope: 'prefix';
  pathPrefix: string;
  dryRun?: boolean;
};

export type InvalidateAllInput = {
  scope: 'all';
  dryRun?: boolean;
};

export type InvalidateProxyCacheInput =
  | InvalidateExactInput
  | InvalidatePrefixInput
  | InvalidateAllInput;

export type InvalidateProxyCacheResult = {
  scope: CacheInvalidationScope;
  dryRun: boolean;
  matched: number;
  deleted: number;
};

type RedisScanResponse = [string, string[]] | { cursor: number | string; keys: string[] };

type RedisClient = {
  scan: (
    cursor: number | string,
    options: { MATCH: string; COUNT: number },
  ) => Promise<RedisScanResponse>;
  del: (...keys: string[]) => Promise<number>;
  exists?: (...keys: string[]) => Promise<number>;
};

@Injectable()
export class CacheAdminService {
  private readonly logger = new Logger(CacheAdminService.name);

  constructor(private readonly cacheService: CacheService) {}

  async invalidate(input: InvalidateProxyCacheInput): Promise<InvalidateProxyCacheResult> {
    const dryRun = input.dryRun ?? false;

    if (input.scope === 'all') {
      return this.invalidateByPattern(input.scope, `${PROXY_GET_CACHE_KEY_PREFIX}*`, dryRun);
    }

    if (input.scope === 'prefix') {
      const normalizedPrefix = this.normalizePathPrefix(input.pathPrefix);
      const escapedPrefix = this.escapeRedisGlob(normalizedPrefix);
      return this.invalidateByPattern(
        input.scope,
        `${PROXY_GET_CACHE_KEY_PREFIX}${escapedPrefix}*`,
        dryRun,
      );
    }

    const normalizedPath = this.normalizePathWithOptionalQuery(input.path);
    if (input.strict) {
      const headers: Record<string, string> = {};
      const accept = this.normalizeHeaderValue(input.headers?.accept);
      const acceptLanguage = this.normalizeHeaderValue(input.headers?.acceptLanguage);
      const apiKey = this.normalizeApiKey(input.headers?.apiKey);
      if (accept) {
        headers.accept = accept;
      }
      if (acceptLanguage) {
        headers['accept-language'] = acceptLanguage;
      }
      if (apiKey) {
        headers.api_key = apiKey;
      }
      const key = buildProxyCacheKey('GET', normalizedPath, {
        ...headers,
      });
      return this.invalidateStrictKey(input.scope, key, dryRun);
    }

    const escapedPath = this.escapeRedisGlob(normalizedPath);
    return this.invalidateByPattern(
      input.scope,
      `${PROXY_GET_CACHE_KEY_PREFIX}${escapedPath}:*`,
      dryRun,
    );
  }

  private async invalidateByPattern(
    scope: CacheInvalidationScope,
    pattern: string,
    dryRun: boolean,
  ): Promise<InvalidateProxyCacheResult> {
    const redis = this.getRedisClient();
    return this.scanAndInvalidateByPattern(redis, scope, pattern, dryRun);
  }

  private async scanAndInvalidateByPattern(
    redis: RedisClient,
    scope: CacheInvalidationScope,
    pattern: string,
    dryRun: boolean,
  ): Promise<InvalidateProxyCacheResult> {
    let cursor = '0';
    let matched = 0;
    let deleted = 0;

    do {
      const response = await redis.scan(cursor, {
        MATCH: pattern,
        COUNT: SCAN_BATCH_SIZE,
      });
      const { nextCursor, batchKeys } = this.parseScanResponse(response);
      matched += batchKeys.length;
      if (!dryRun && batchKeys.length > 0) {
        deleted += await this.deleteInBatches(redis, batchKeys);
      }
      cursor = nextCursor;
    } while (cursor !== '0');

    return {
      scope,
      dryRun,
      matched,
      deleted,
    };
  }

  private parseScanResponse(response: RedisScanResponse): {
    nextCursor: string;
    batchKeys: string[];
  } {
    if (Array.isArray(response)) {
      const [nextCursor, batchKeys] = response;
      return { nextCursor: String(nextCursor), batchKeys };
    }

    return {
      nextCursor: String(response.cursor),
      batchKeys: response.keys,
    };
  }

  private async invalidateKeys(
    scope: CacheInvalidationScope,
    keys: string[],
    dryRun: boolean,
  ): Promise<InvalidateProxyCacheResult> {
    if (keys.length === 0) {
      return {
        scope,
        dryRun,
        matched: 0,
        deleted: 0,
      };
    }

    if (dryRun) {
      return {
        scope,
        dryRun,
        matched: keys.length,
        deleted: 0,
      };
    }

    const redis = this.getRedisClient();
    const deleted = await this.deleteInBatches(redis, keys);

    return {
      scope,
      dryRun,
      matched: keys.length,
      deleted,
    };
  }

  private async invalidateStrictKey(
    scope: CacheInvalidationScope,
    key: string,
    dryRun: boolean,
  ): Promise<InvalidateProxyCacheResult> {
    const redis = this.getRedisClient();
    if (dryRun) {
      const exists = await this.keyExists(redis, key);
      return {
        scope,
        dryRun: true,
        matched: exists ? 1 : 0,
        deleted: 0,
      };
    }

    const deleted = await redis.del(key);
    return {
      scope,
      dryRun: false,
      matched: deleted > 0 ? 1 : 0,
      deleted,
    };
  }

  private async keyExists(redis: RedisClient, key: string): Promise<boolean> {
    if (typeof redis.exists === 'function') {
      const result = await redis.exists(key);
      return result > 0;
    }

    const escapedKey = this.escapeRedisGlob(key);
    let cursor = '0';

    do {
      const response = await redis.scan(cursor, {
        MATCH: escapedKey,
        COUNT: 1,
      });
      const { nextCursor, batchKeys } = this.parseScanResponse(response);
      if (batchKeys.includes(key)) {
        return true;
      }
      cursor = nextCursor;
    } while (cursor !== '0');

    return false;
  }

  private async deleteInBatches(redis: RedisClient, keys: string[]): Promise<number> {
    let deleted = 0;

    for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
      const batch = keys.slice(index, index + DELETE_BATCH_SIZE);
      deleted += await redis.del(...batch);
    }

    return deleted;
  }

  private getRedisClient(): RedisClient {
    const client = this.cacheService.getStoreClient<RedisClient>();
    if (!client || typeof client.scan !== 'function' || typeof client.del !== 'function') {
      this.logger.error('Redis client unavailable for cache invalidation');
      throw new ServiceUnavailableException('Cache invalidation backend unavailable');
    }

    return client;
  }

  private normalizePathWithOptionalQuery(value: string): string {
    const trimmed = value.trim();
    const queryIndex = trimmed.indexOf('?');
    if (queryIndex < 0) {
      return this.normalizePathPart(trimmed);
    }

    const rawPathPart = trimmed.slice(0, queryIndex);
    const rawQuery = trimmed.slice(queryIndex + 1);
    const normalizedPath = this.normalizePathPart(rawPathPart);

    if (rawQuery.trim().length === 0) {
      return normalizedPath;
    }

    return `${normalizedPath}?${rawQuery}`;
  }

  private normalizePathPrefix(value: string): string {
    const trimmed = value.trim();
    if (trimmed.includes('?')) {
      throw new BadRequestException('pathPrefix must not contain query parameters');
    }

    return this.normalizePathPart(trimmed);
  }

  private normalizePathPart(value: string): string {
    if (value.includes('://')) {
      throw new BadRequestException('path must not be an absolute URL');
    }

    const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
    const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
    const normalized = collapsed.replace(/\/+$/g, '');

    return normalized.length === 0 ? '/' : normalized;
  }

  private normalizeHeaderValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed;
  }

  private normalizeApiKey(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed;
  }

  private escapeRedisGlob(value: string): string {
    return value.replace(/([\\*?[\]])/g, '\\$1');
  }
}
