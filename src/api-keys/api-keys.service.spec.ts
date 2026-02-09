import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CacheService } from '../cache/cache.service';
import { sha256Hex } from '../utils/hash';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let redisKv: Map<string, string>;
  let redisSets: Map<string, Set<string>>;
  let redisExpiry: Map<string, number>;

  const prefix = 'test-api-keys';

  const clearExpired = () => {
    const now = Date.now();
    for (const [key, expiresAt] of redisExpiry.entries()) {
      if (now >= expiresAt) {
        redisKv.delete(key);
        redisSets.delete(key);
        redisExpiry.delete(key);
      }
    }
  };

  beforeEach(async () => {
    redisKv = new Map();
    redisSets = new Map();
    redisExpiry = new Map();

    const redisClient = {
      get: jest.fn(async (key: string) => {
        clearExpired();
        return redisKv.get(key) ?? null;
      }),
      set: jest.fn(async (key: string, value: string) => {
        clearExpired();
        redisKv.set(key, value);
        redisSets.delete(key);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        clearExpired();
        const existed = redisKv.delete(key) || redisSets.delete(key) ? 1 : 0;
        redisExpiry.delete(key);
        return existed;
      }),
      incr: jest.fn(async (key: string) => {
        clearExpired();
        const next = Number(redisKv.get(key) ?? '0') + 1;
        redisKv.set(key, String(next));
        return next;
      }),
      expire: jest.fn(async (key: string, seconds: number) => {
        clearExpired();
        if (!redisKv.has(key) && !redisSets.has(key)) {
          return 0;
        }
        redisExpiry.set(key, Date.now() + seconds * 1000);
        return 1;
      }),
      sAdd: jest.fn(async (key: string, member: string) => {
        clearExpired();
        const set = redisSets.get(key) ?? new Set<string>();
        const prev = set.size;
        set.add(member);
        redisSets.set(key, set);
        return set.size > prev ? 1 : 0;
      }),
      sMembers: jest.fn(async (key: string) => {
        clearExpired();
        return [...(redisSets.get(key) ?? new Set<string>())];
      }),
      sRem: jest.fn(async (key: string, member: string) => {
        clearExpired();
        const set = redisSets.get(key);
        if (!set) {
          return 0;
        }
        const existed = set.delete(member) ? 1 : 0;
        if (set.size === 0) {
          redisSets.delete(key);
        }
        return existed;
      }),
      ping: jest.fn(async () => 'PONG'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(async () => undefined),
            set: jest.fn(async () => undefined),
            del: jest.fn(async () => undefined),
            store: {
              client: redisClient,
              isFallback: false,
              isRedis: true,
              name: 'redis',
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'CACHE_TTL_DEFAULT') return 60;
              if (key === 'CACHE_STALE_TTL') return 5;
              if (key === 'API_KEYS_REDIS_PREFIX') return prefix;
              if (key === 'API_KEYS_RATE_LIMIT_WINDOW_SECONDS') return 60;
              if (key === 'API_KEYS_RATE_LIMIT_MAX_REQUESTS') return 2;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  it('creates and validates api keys', async () => {
    const created = await service.createApiKey({ owner: 'mobile-app-prod' });

    expect(created.record.owner).toBe('mobile-app-prod');
    expect(created.apiKey).toMatch(/^sk_/);

    await expect(service.validateClientApiKey(created.apiKey)).resolves.toEqual(
      expect.objectContaining({
        keyId: created.record.keyId,
        owner: 'mobile-app-prod',
      }),
    );
  });

  it('revokes and reactivates api keys', async () => {
    const created = await service.createApiKey({ owner: 'partner-portal' });

    await service.revokeApiKey(created.record.keyId);
    await expect(service.validateClientApiKey(created.apiKey)).resolves.toBeNull();

    await service.activateApiKey(created.record.keyId);
    await expect(service.validateClientApiKey(created.apiKey)).resolves.toEqual(
      expect.objectContaining({ keyId: created.record.keyId }),
    );
  });

  it('deletes api keys and index entries', async () => {
    const created = await service.createApiKey({ owner: 'etl-job-prod' });

    await service.deleteApiKey(created.record.keyId);

    await expect(service.validateClientApiKey(created.apiKey)).resolves.toBeNull();
    await expect(service.listApiKeys()).resolves.toEqual([]);
  });

  it('applies per-key rate limits', async () => {
    const created = await service.createApiKey({ owner: 'limit-test' });
    const keyId = created.record.keyId;

    await expect(service.consumeRateLimit(keyId)).resolves.toEqual(
      expect.objectContaining({ allowed: true, remaining: 1 }),
    );
    await expect(service.consumeRateLimit(keyId)).resolves.toEqual(
      expect.objectContaining({ allowed: true, remaining: 0 }),
    );
    await expect(service.consumeRateLimit(keyId)).resolves.toEqual(
      expect.objectContaining({ allowed: false, remaining: 0 }),
    );
  });

  it('rejects expired key records', async () => {
    const rawApiKey = 'sk_expired_key';
    const hash = sha256Hex(rawApiKey);
    const keyId = 'expired-key-id';
    const record = {
      keyId,
      hash,
      owner: 'expired-owner',
      createdAt: new Date().toISOString(),
      revoked: false,
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };

    redisKv.set(`${prefix}:hash:${hash}`, keyId);
    redisKv.set(`${prefix}:key:${keyId}`, JSON.stringify(record));

    await expect(service.validateClientApiKey(rawApiKey)).resolves.toBeNull();
  });

  it('falls back to safe defaults when rate-limit config is invalid', async () => {
    const redisClient = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 0),
      incr: jest.fn(async () => 1),
      expire: jest.fn(async () => 1),
      sAdd: jest.fn(async () => 1),
      sMembers: jest.fn(async () => []),
      sRem: jest.fn(async () => 0),
      ping: jest.fn(async () => 'PONG'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(async () => undefined),
            set: jest.fn(async () => undefined),
            del: jest.fn(async () => undefined),
            store: {
              client: redisClient,
              isFallback: false,
              isRedis: true,
              name: 'redis',
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'CACHE_TTL_DEFAULT') return 60;
              if (key === 'CACHE_STALE_TTL') return 5;
              if (key === 'API_KEYS_REDIS_PREFIX') return prefix;
              if (key === 'API_KEYS_RATE_LIMIT_WINDOW_SECONDS') return NaN;
              if (key === 'API_KEYS_RATE_LIMIT_MAX_REQUESTS') return 0;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    const fallbackService = module.get<ApiKeysService>(ApiKeysService);
    await expect(fallbackService.consumeRateLimit('fallback-key')).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        limit: 120,
        remaining: 119,
      }),
    );
  });
});
