import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Cache } from 'cache-manager';

import { CacheService } from '../cache/cache.service';
import { HttpClientService } from '../http-client/http-client.service';
import { ProxyService } from './proxy.service';
import { buildProxyCacheKey } from './proxy-cache';

describe('ProxyService', () => {
  let service: ProxyService;
  let httpClientService: { requestRaw: jest.Mock };
  let cacheStore: Map<string, unknown>;
  let cacheManager: Cache;

  beforeEach(async () => {
    cacheStore = new Map();
    cacheManager = {
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        cacheStore.delete(key);
      }),
      reset: jest.fn(async () => undefined),
      on: jest.fn(),
      removeListener: jest.fn(),
      wrap: jest.fn(),
      store: {
        client: {
          ping: jest.fn().mockResolvedValue('PONG'),
        },
        isFallback: false,
      },
    } as unknown as Cache;

    httpClientService = {
      requestRaw: jest.fn().mockResolvedValue({
        status: 200,
        body: { ok: true },
        contentType: 'application/json',
        headers: {
          'cache-control': 'max-age=60',
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
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
                  return 60;
                case 'CACHE_STALE_TTL':
                  return 30;
                case 'CACHE_IGNORE_UPSTREAM_CONTROL':
                  return 'false';
                case 'CACHE_BYPASS_PATHS':
                  return '/bypass';
                case 'CACHE_DEBUG':
                  return 'true';
                default:
                  return undefined;
              }
            },
          },
        },
        {
          provide: HttpClientService,
          useValue: httpClientService,
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('caches GET responses and returns hits on subsequent calls', async () => {
    const first = await service.forward('GET', '/example', undefined, {
      headers: { accept: 'application/json' },
    });

    expect(first.response.body).toEqual({ ok: true });
    expect(first.cacheStatus).toBe('MISS');
    expect(first.cacheKeyHash).toHaveLength(32);

    const second = await service.forward('GET', '/example', undefined, {
      headers: { accept: 'application/json' },
    });

    expect(second.cacheStatus).toBe('HIT');
    expect(second.cacheKeyHash).toBe(first.cacheKeyHash);
    expect(httpClientService.requestRaw).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when authorization header is present', async () => {
    const first = await service.forward('GET', '/secure', undefined, {
      headers: { authorization: 'Bearer token' },
    });

    expect(first.cacheStatus).toBe('BYPASS');

    await service.forward('GET', '/secure', undefined, {
      headers: { authorization: 'Bearer token' },
    });

    expect(httpClientService.requestRaw).toHaveBeenCalledTimes(2);
  });

  it('returns stale responses and refreshes in background', async () => {
    const key = buildProxyCacheKey('GET', '/stale', { accept: 'application/json' });
    cacheStore.set(key, {
      value: {
        status: 200,
        body: { ok: true },
        contentType: 'application/json',
        headers: {
          'cache-control': 'max-age=60',
        },
      },
      staleUntil: Date.now() - 1000,
      __cacheEntry: true,
    });

    const response = await service.forward('GET', '/stale', undefined, {
      headers: { accept: 'application/json' },
    });

    expect(response.cacheStatus).toBe('STALE');
    await new Promise((resolve) => setImmediate(resolve));
    expect(httpClientService.requestRaw).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache for configured paths', async () => {
    const first = await service.forward('GET', '/bypass/resource?foo=bar', undefined, {
      headers: { accept: 'application/json' },
    });

    expect(first.cacheStatus).toBe('BYPASS');

    await service.forward('GET', '/bypass/resource?foo=bar', undefined, {
      headers: { accept: 'application/json' },
    });

    expect(httpClientService.requestRaw).toHaveBeenCalledTimes(2);
  });
});
