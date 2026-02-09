import type { CacheStore } from '@nestjs/cache-manager';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

import { CacheService } from './cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger(CacheModule.name);
        const ttlSeconds = Number(configService.get('CACHE_TTL_DEFAULT') ?? 300);
        const redisUrl = configService.get<string>('CACHE_REDIS_URL') ?? '';

        const noopStore: CacheStore & { isFallback: boolean; isRedis?: boolean; name?: string } = {
          get: async <T>() => undefined as T | undefined,
          set: async () => undefined,
          del: async () => undefined,
          isFallback: true,
          isRedis: false,
          name: 'noop',
        };

        try {
          const store = (await redisStore({ url: redisUrl })) as CacheStore & {
            isFallback?: boolean;
            isRedis?: boolean;
            name?: string;
          };
          store.isFallback = false;
          store.isRedis = true;
          store.name ??= 'redis';
          // cache-manager v5 expects TTL in milliseconds; config is in seconds.
          return { ttl: ttlSeconds * 1000, store };
        } catch (error) {
          logger.warn('Redis cache unavailable; using no-op cache store.');
          // In-memory cache-manager uses seconds, so keep TTL as-is for the noop store.
          return { ttl: ttlSeconds, store: noopStore };
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
