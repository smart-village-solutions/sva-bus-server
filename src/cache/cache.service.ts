import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

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
};

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtlSeconds: number;
  private readonly defaultStaleTtlSeconds: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtlSeconds = Number(this.configService.get('CACHE_TTL_DEFAULT') ?? 300);
    this.defaultStaleTtlSeconds = Number(this.configService.get('CACHE_STALE_TTL') ?? 60);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.cacheManager.get<CacheEntry<T> | T | null>(key);
      if (!entry) {
        return null;
      }
      return this.isCacheEntry(entry) ? entry.value : entry;
    } catch (error) {
      this.logger.warn(`Cache get failed for ${key}`);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: { ttl?: number; staleTtl?: number },
  ): Promise<void> {
    const ttl = options?.ttl ?? this.defaultTtlSeconds;
    const staleTtl = options?.staleTtl ?? 0;

    try {
      if (staleTtl > 0) {
        const entry: CacheEntry<T> = {
          value,
          staleUntil: Date.now() + ttl * 1000,
          __cacheEntry: true,
        };
        await this.cacheManager.set(key, entry, ttl + staleTtl);
        return;
      }

      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.warn(`Cache set failed for ${key}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed for ${key}`);
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
        this.logger.warn(`Cache entry for ${key} is stale; refreshing in background.`);
        void this.refreshInBackground(key, loader, ttl, staleTtl);
      }
      return cachedEntry.value;
    }

    const value = await loader();
    await this.set(key, value, { ttl, staleTtl });
    return value;
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
      this.logger.warn(`Cache get failed for ${key}`);
      return null;
    }
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
      this.logger.warn(`Cache refresh failed for ${key}`);
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
}
