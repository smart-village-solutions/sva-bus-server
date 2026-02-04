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
        const ttl = Number(configService.get('CACHE_TTL_DEFAULT') ?? 300);
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
          return { ttl, store };
        } catch (error) {
          logger.warn('Redis cache unavailable; using no-op cache store.');
          return { ttl, store: noopStore };
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
