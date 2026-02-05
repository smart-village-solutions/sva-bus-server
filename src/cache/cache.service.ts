import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import { hashKeyForLogging } from '../utils/hash';
import { parseBoolean } from '../utils/parse-boolean';

// Cache status meanings:
// - HIT: response served from cache
// - MISS: response fetched from upstream and cached
// - STALE: stale cache entry served; refresh in background
// - BYPASS: caching skipped (e.g. auth header, bypass path, or cache unavailable)
export type CacheStatus = 'HIT' | 'MISS' | 'STALE' | 'BYPASS';

export type CacheableResult<T> = {
  value: T;
  cacheable?: boolean;
  ttl?: number;
  staleTtl?: number;
};

export type CacheWrapResult<T> = {
  value: T;
  status: CacheStatus;
};

type CacheEntry<T> = {
  value: T;
  staleUntil?: number;
  __cacheEntry: true;
};

type CacheStoreClient = {
  ping?: () => Promise<string>;
};

type CacheStore = {
  client?: CacheStoreClient;
  isFallback?: boolean;
  isRedis?: boolean;
  name?: string;
};

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtlSeconds: number;
  private readonly defaultStaleTtlSeconds: number;
  private readonly cacheDebug: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtlSeconds = Number(this.configService.get('CACHE_TTL_DEFAULT') ?? 300);
    this.defaultStaleTtlSeconds = Number(this.configService.get('CACHE_STALE_TTL') ?? 60);
    this.cacheDebug = parseBoolean(this.configService.get('CACHE_DEBUG'));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.cacheManager.get<CacheEntry<T> | T | null>(key);
      if (!entry) {
        return null;
      }
      return this.isCacheEntry(entry) ? entry.value : entry;
    } catch (error) {
      this.logger.warn(`Cache get failed for key hash: ${hashKeyForLogging(key)}`);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<void> {
    await this.setWithResult(key, value, options);
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed for key hash: ${hashKeyForLogging(key)}`);
    }
  }

  async wrap<T>(
    key: string,
    loader: () => Promise<T>,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<T> {
    const ttl = options?.ttl ?? this.defaultTtlSeconds;
    const staleTtl = options?.staleTtl ?? this.defaultStaleTtlSeconds;
    const cachedEntry = await this.getEntry<T>(key);

    if (cachedEntry) {
      if (cachedEntry.staleUntil && Date.now() > cachedEntry.staleUntil) {
        this.logger.warn(
          `Cache entry for key hash ${hashKeyForLogging(key)} is stale; refreshing in background.`,
        );
        void this.refreshInBackground(key, loader, ttl, staleTtl);
      }
      return cachedEntry.value;
    }

    const value = await loader();
    await this.set(key, value, { ttl, staleTtl });
    return value;
  }

  async wrapCacheable<T>(
    key: string,
    loader: () => Promise<CacheableResult<T>>,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<CacheWrapResult<T>> {
    if (!this.isCacheAvailable()) {
      const result = await loader();
      return { value: result.value, status: 'BYPASS' };
    }

    const entryState = await this.getEntryWithStatus<T>(key);

    if (entryState) {
      if (entryState.status === 'STALE') {
        void this.refreshInBackgroundWithPolicy(key, loader, options);
      }
      return { value: entryState.entry.value, status: entryState.status };
    }

    const result = await loader();
    if (result.cacheable === false) {
      return { value: result.value, status: 'BYPASS' };
    }

    const ttl = result.ttl ?? options?.ttl ?? this.defaultTtlSeconds;
    const staleTtl = result.staleTtl ?? options?.staleTtl ?? this.defaultStaleTtlSeconds;
    const stored = await this.setWithResult(key, result.value, { ttl, staleTtl });
    return { value: result.value, status: stored ? 'MISS' : 'BYPASS' };
  }

  async checkHealth(): Promise<{ status: 'ok' | 'degraded'; message?: string }> {
    try {
      const store = (this.cacheManager as { store?: CacheStore }).store;
      if (!store?.client?.ping) {
        return { status: 'degraded', message: 'Cache store client unavailable' };
      }
      await store.client.ping();
      return { status: 'ok' };
    } catch (error) {
      this.logger.warn('Cache health check failed');
      return { status: 'degraded', message: 'Cache backend unreachable' };
    }
  }

  private async getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const entry = await this.cacheManager.get<CacheEntry<T> | T | null>(key);
      if (!entry) {
        return null;
      }
      return this.isCacheEntry(entry) ? entry : { value: entry, __cacheEntry: true };
    } catch (error) {
      this.logger.warn(`Cache get failed for key hash: ${hashKeyForLogging(key)}`);
      return null;
    }
  }

  private async getEntryWithStatus<T>(
    key: string,
  ): Promise<{ entry: CacheEntry<T>; status: CacheStatus } | null> {
    const entry = await this.getEntry<T>(key);
    if (!entry) {
      return null;
    }

    if (entry.staleUntil && Date.now() > entry.staleUntil) {
      return { entry, status: 'STALE' };
    }

    return { entry, status: 'HIT' };
  }

  private async refreshInBackground<T>(
    key: string,
    loader: () => Promise<T>,
    ttl: number,
    staleTtl: number,
  ): Promise<void> {
    try {
      const value = await loader();
      await this.set(key, value, { ttl, staleTtl });
    } catch (error) {
      this.logger.warn(`Cache refresh failed for key hash: ${hashKeyForLogging(key)}`);
    }
  }

  private async refreshInBackgroundWithPolicy<T>(
    key: string,
    loader: () => Promise<CacheableResult<T>>,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<void> {
    try {
      const result = await loader();
      if (result.cacheable === false) {
        return;
      }
      const ttl = result.ttl ?? options?.ttl ?? this.defaultTtlSeconds;
      const staleTtl = result.staleTtl ?? options?.staleTtl ?? this.defaultStaleTtlSeconds;
      await this.setWithResult(key, result.value, { ttl, staleTtl });
    } catch (error) {
      this.logger.warn(`Cache refresh failed for key hash: ${hashKeyForLogging(key)}`);
    }
  }

  private isCacheEntry<T>(entry: CacheEntry<T> | T): entry is CacheEntry<T> {
    return (
      typeof entry === 'object' &&
      entry !== null &&
      '__cacheEntry' in entry &&
      (entry as CacheEntry<T>).__cacheEntry === true
    );
  }

  private async setWithResult<T>(
    key: string,
    value: T,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<boolean> {
    const ttlSeconds = options?.ttl ?? this.defaultTtlSeconds;
    const staleTtlSeconds = options?.staleTtl ?? 0;
    // Redis expects ms TTL, so we normalize based on store type.
    const ttl = this.normalizeTtl(ttlSeconds);
    const staleTtl = this.normalizeTtl(staleTtlSeconds);

    try {
      if (staleTtl > 0) {
        const entry: CacheEntry<T> = {
          value,
          staleUntil: Date.now() + ttlSeconds * 1000,
          __cacheEntry: true,
        };
        await this.cacheManager.set(key, entry, ttl + staleTtl);
        if (this.cacheDebug) {
          this.logger.debug(
            JSON.stringify({
              message: 'Cache set',
              keyHash: hashKeyForLogging(key),
              ttlSeconds,
              staleTtlSeconds,
              ttlUnit: this.getTtlUnit(),
              mode: 'swr',
            }),
          );
        }
        return true;
      }

      await this.cacheManager.set(key, value, ttl);
      if (this.cacheDebug) {
        this.logger.debug(
          JSON.stringify({
            message: 'Cache set',
            keyHash: hashKeyForLogging(key),
            ttlSeconds,
            staleTtlSeconds,
            ttlUnit: this.getTtlUnit(),
            mode: 'ttl',
          }),
        );
      }
      return true;
    } catch (error) {
      this.logger.warn(`Cache set failed for key hash: ${hashKeyForLogging(key)}`);
      return false;
    }
  }

  private isCacheAvailable(): boolean {
    const store = (this.cacheManager as { store?: CacheStore }).store;
    if (!store) {
      return false;
    }
    if (store.isFallback) {
      return false;
    }
    return true;
  }

  private normalizeTtl(valueSeconds: number): number {
    // Redis uses PX (ms); in-memory cache-manager uses seconds.
    if (this.getTtlUnit() === 'ms') {
      return valueSeconds * 1000;
    }
    return valueSeconds;
  }

  private getTtlUnit(): 's' | 'ms' {
    const store = (this.cacheManager as { store?: CacheStore }).store;
    if (store?.isRedis || store?.name === 'redis') {
      return 'ms';
    }
    return 's';
  }

}
