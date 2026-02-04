import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let cacheStore: Map<string, unknown>;
  let cacheExpiry: Map<string, number>;
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    store: { client: { ping: jest.Mock }; isFallback?: boolean };
  };

  beforeEach(async () => {
    cacheStore = new Map();
    cacheExpiry = new Map();
    cacheManager = {
      get: jest.fn(async (key: string) => {
        const expiresAt = cacheExpiry.get(key);
        if (expiresAt !== undefined && Date.now() >= expiresAt) {
          cacheStore.delete(key);
          cacheExpiry.delete(key);
          return undefined;
        }

        return cacheStore.get(key);
      }),
      set: jest.fn(async (key: string, value: unknown, ttl?: number) => {
        cacheStore.set(key, value);
        if (ttl !== undefined) {
          cacheExpiry.set(key, Date.now() + ttl * 1000);
        }
      }),
      del: jest.fn(async (key: string) => {
        cacheStore.delete(key);
        cacheExpiry.delete(key);
      }),
      store: {
        client: {
          ping: jest.fn().mockResolvedValue('PONG'),
        },
        isFallback: false,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              switch (key) {
                case 'CACHE_TTL_DEFAULT':
                  return 1;
                case 'CACHE_STALE_TTL':
                  return 1;
                default:
                  return undefined;
              }
            },
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('stores and retrieves values', async () => {
    await service.set('key', 'value');
    await expect(service.get('key')).resolves.toEqual('value');
  });

  it('wraps loader when cache misses', async () => {
    const loader = jest.fn().mockResolvedValue('fresh');

    await expect(service.wrap('wrap-key', loader)).resolves.toEqual('fresh');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('deletes cached values', async () => {
    await service.set('delete-key', 'delete-value');
    await service.del('delete-key');

    await expect(service.get('delete-key')).resolves.toBeNull();
  });

  it('expires values after ttl', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    await service.set('ttl-key', 'ttl-value', { ttl: 1 });
    await expect(service.get('ttl-key')).resolves.toEqual('ttl-value');

    await jest.advanceTimersByTimeAsync(1100);
    await expect(service.get('ttl-key')).resolves.toBeNull();

    jest.useRealTimers();
  });

  it('returns stale value and refreshes in background', async () => {
    const loader = jest.fn().mockResolvedValue('updated');
    const staleEntry = { value: 'stale', staleUntil: Date.now() - 1000, __cacheEntry: true };
    cacheStore.set('stale-key', staleEntry);

    await expect(service.wrap('stale-key', loader)).resolves.toEqual('stale');
    await new Promise((resolve) => setImmediate(resolve));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('wrapCacheable returns miss and stores values', async () => {
    const loader = jest.fn().mockResolvedValue({ value: 'fresh' });

    await expect(service.wrapCacheable('cacheable-key', loader)).resolves.toEqual({
      value: 'fresh',
      status: 'MISS',
    });
    expect(cacheStore.get('cacheable-key')).toBeDefined();
  });

  it('wrapCacheable bypasses when cacheable is false', async () => {
    const loader = jest.fn().mockResolvedValue({ value: 'fresh', cacheable: false });

    await expect(service.wrapCacheable('bypass-key', loader)).resolves.toEqual({
      value: 'fresh',
      status: 'BYPASS',
    });
    expect(cacheStore.has('bypass-key')).toBe(false);
  });

  it('reports cache health', async () => {
    await expect(service.checkHealth()).resolves.toEqual({ status: 'ok' });
  });
});
