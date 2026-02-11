import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';

import type { Cache } from 'cache-manager';
import { AppModule } from '../src/app.module';
import { HttpClientService } from '../src/http-client/http-client.service';
import { buildProxyCacheKey } from '../src/proxy/proxy-cache';
import { sha256Hex } from '../src/utils/hash';

const CACHE_STATUSES = new Set(['HIT', 'MISS', 'STALE', 'BYPASS']);
const TEST_CLIENT_API_KEY = 'client-key-e2e';
const TEST_ADMIN_TOKEN = 'admin-token-e2e';
const TEST_KEYS_PREFIX = 'test-api-keys';

const expectCacheHeader = (response: { headers: Record<string, unknown> }) => {
  const cacheHeader = response.headers['x-cache'];
  expect(cacheHeader).toBeDefined();
  if (cacheHeader !== undefined) {
    expect(CACHE_STATUSES.has(String(cacheHeader))).toBe(true);
  }
};

const buildUpstreamResponse = (overrides?: {
  status?: number;
  body?: unknown;
  contentType?: string | null;
  headers?: Record<string, string>;
}) => ({
  status: 200,
  body: { ok: true },
  contentType: 'application/json',
  headers: {},
  ...(overrides ?? {}),
});

describe('Proxy endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  let httpClientService: { requestRaw: jest.Mock };
  let cacheStore: Map<string, unknown>;
  let cacheExpiry: Map<string, number>;
  let redisStore: Map<string, string>;
  let redisSets: Map<string, Set<string>>;
  let redisExpiry: Map<string, number>;
  let cacheManager: Cache;
  let originalBaseUrl: string | undefined;
  let originalBodyLimit: string | undefined;

  type InjectRequest = Exclude<Parameters<NestFastifyApplication['inject']>[0], string>;

  const redisPatternToRegex = (pattern: string): RegExp => {
    let regex = '^';

    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (!char) {
        continue;
      }

      if (char === '\\') {
        const next = pattern[index + 1];
        if (next) {
          regex += next.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
          index += 1;
        } else {
          regex += '\\\\';
        }
        continue;
      }

      if (char === '*') {
        regex += '.*';
        continue;
      }

      if (char === '?') {
        regex += '.';
        continue;
      }

      regex += char.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    }

    regex += '$';
    return new RegExp(regex);
  };

  const clearExpiredRedis = () => {
    const now = Date.now();
    for (const [key, expiresAt] of redisExpiry.entries()) {
      if (now >= expiresAt) {
        redisStore.delete(key);
        redisSets.delete(key);
        redisExpiry.delete(key);
      }
    }
  };

  const injectProxy = (request: InjectRequest): ReturnType<NestFastifyApplication['inject']> => {
    const headers = {
      ...(request?.headers ?? {}),
      'x-api-key': TEST_CLIENT_API_KEY,
    };

    return app.inject({
      ...request,
      headers,
    });
  };

  beforeAll(async () => {
    originalBaseUrl = process.env.HTTP_CLIENT_BASE_URL;
    originalBodyLimit = process.env.PROXY_BODY_LIMIT;
    process.env.HTTP_CLIENT_BASE_URL = 'https://example.com';
    delete process.env.PROXY_BODY_LIMIT;

    cacheStore = new Map();
    cacheExpiry = new Map();
    redisStore = new Map();
    redisSets = new Map();
    redisExpiry = new Map();
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
      reset: jest.fn(async () => undefined),
      on: jest.fn(),
      removeListener: jest.fn(),
      wrap: jest.fn(),
      store: {
        client: {
          get: jest.fn(async (key: string) => {
            clearExpiredRedis();
            return redisStore.get(key) ?? null;
          }),
          set: jest.fn(async (key: string, value: string) => {
            clearExpiredRedis();
            redisStore.set(key, value);
            redisSets.delete(key);
            return 'OK';
          }),
          del: jest.fn(async (...keys: string[]) => {
            clearExpiredRedis();
            let deleted = 0;
            keys.forEach((key) => {
              const deletedInRedis = redisStore.delete(key) || redisSets.delete(key);
              const deletedInCache = cacheStore.delete(key);
              if (deletedInCache) {
                cacheExpiry.delete(key);
              }
              if (deletedInRedis || deletedInCache) {
                deleted += 1;
              }
              redisExpiry.delete(key);
            });
            return deleted;
          }),
          incr: jest.fn(async (key: string) => {
            clearExpiredRedis();
            const current = Number(redisStore.get(key) ?? '0') + 1;
            redisStore.set(key, String(current));
            return current;
          }),
          expire: jest.fn(async (key: string, seconds: number) => {
            clearExpiredRedis();
            if (!redisStore.has(key) && !redisSets.has(key)) {
              return 0;
            }
            redisExpiry.set(key, Date.now() + seconds * 1000);
            return 1;
          }),
          sAdd: jest.fn(async (key: string, member: string) => {
            clearExpiredRedis();
            const members = redisSets.get(key) ?? new Set<string>();
            const sizeBefore = members.size;
            members.add(member);
            redisSets.set(key, members);
            return members.size > sizeBefore ? 1 : 0;
          }),
          sMembers: jest.fn(async (key: string) => {
            clearExpiredRedis();
            return [...(redisSets.get(key) ?? new Set<string>())];
          }),
          sRem: jest.fn(async (key: string, member: string) => {
            clearExpiredRedis();
            const members = redisSets.get(key);
            if (!members) {
              return 0;
            }
            const existed = members.delete(member) ? 1 : 0;
            if (members.size === 0) {
              redisSets.delete(key);
            }
            return existed;
          }),
          scan: jest.fn(
            async (cursor: string | number, options: { MATCH: string; COUNT?: number }) => {
              clearExpiredRedis();
              const matcher = redisPatternToRegex(options.MATCH);
              const keys = [...redisStore.keys(), ...redisSets.keys(), ...cacheStore.keys()].filter(
                (key) => matcher.test(key),
              );
              return [String(cursor ?? '0') === '0' ? '0' : '0', keys] as [string, string[]];
            },
          ),
          ping: jest.fn().mockResolvedValue('PONG'),
        },
        isFallback: false,
        name: 'memory',
      },
    } as unknown as Cache;

    httpClientService = {
      requestRaw: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'HTTP_CLIENT_API_KEY') return 'test-key';
          if (key === 'HTTP_CLIENT_BASE_URL') return '';
          if (key === 'HTTP_CLIENT_TIMEOUT') return '10000';
          if (key === 'HTTP_CLIENT_RETRIES') return '2';
          if (key === 'CACHE_DEBUG') return 'true';
          if (key === 'API_KEYS_REDIS_PREFIX') return TEST_KEYS_PREFIX;
          if (key === 'API_KEYS_RATE_LIMIT_WINDOW_SECONDS') return 60;
          if (key === 'API_KEYS_RATE_LIMIT_MAX_REQUESTS') return 5;
          if (key === 'ADMIN_API_TOKEN') return TEST_ADMIN_TOKEN;
          return undefined;
        },
      })
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheManager)
      .overrideProvider(HttpClientService)
      .useValue(httpClientService)
      .compile();

    const bodyLimit = Number(process.env.PROXY_BODY_LIMIT ?? 1048576);
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    httpClientService.requestRaw.mockReset();
    cacheStore.clear();
    cacheExpiry.clear();
    redisStore.clear();
    redisSets.clear();
    redisExpiry.clear();

    const hash = sha256Hex(TEST_CLIENT_API_KEY);
    const keyId = 'key-e2e-1';
    const record = {
      keyId,
      hash,
      owner: 'e2e-suite',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      revoked: false,
    };
    redisStore.set(`${TEST_KEYS_PREFIX}:hash:${hash}`, keyId);
    redisStore.set(`${TEST_KEYS_PREFIX}:key:${keyId}`, JSON.stringify(record));
    redisSets.set(`${TEST_KEYS_PREFIX}:index`, new Set([keyId]));
  });

  afterAll(async () => {
    await app.close();
    if (originalBaseUrl === undefined) {
      delete process.env.HTTP_CLIENT_BASE_URL;
    } else {
      process.env.HTTP_CLIENT_BASE_URL = originalBaseUrl;
    }
    if (originalBodyLimit === undefined) {
      delete process.env.PROXY_BODY_LIMIT;
    } else {
      process.env.PROXY_BODY_LIMIT = originalBodyLimit;
    }
  });

  it('forwards GET requests', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/test?foo=bar',
      headers: {
        'x-request-id': 'abc-123',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expectCacheHeader(response);
    expect(String(response.headers['x-cache-key-hash'] ?? '')).toHaveLength(32);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/test?foo=bar',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'test-key', 'x-request-id': 'abc-123' }),
      }),
    );
  });

  it('returns 401 when x-api-key is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
    });

    expect(response.statusCode).toBe(401);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });

  it('creates and revokes api keys via admin endpoints', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/internal/api-keys',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        owner: 'partner-portal-prod',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { apiKey: string; keyId: string };
    expect(created.apiKey).toMatch(/^sk_/);
    expect(created.keyId).toBeTruthy();

    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());
    const validProxyResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        'x-api-key': created.apiKey,
      },
    });
    expect(validProxyResponse.statusCode).toBe(200);

    const revokeResponse = await app.inject({
      method: 'POST',
      url: `/internal/api-keys/${created.keyId}/revoke`,
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
    });
    expect(revokeResponse.statusCode).toBe(201);

    const revokedProxyResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/test',
      headers: {
        'x-api-key': created.apiKey,
      },
    });
    expect(revokedProxyResponse.statusCode).toBe(401);
  });

  it('rejects admin endpoints without valid bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/internal/api-keys',
    });

    expect(response.statusCode).toBe(401);
  });

  it('invalidates exact cache path variants via admin endpoint', async () => {
    httpClientService.requestRaw.mockResolvedValue(buildUpstreamResponse());

    const first = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=test&areaId=10790',
      headers: {
        accept: '*/*',
        'accept-language': 'de-DE',
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=test&areaId=10790',
      headers: {
        accept: '*/*',
        'accept-language': 'de-DE',
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');

    const invalidate = await app.inject({
      method: 'POST',
      url: '/internal/cache/invalidate',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        scope: 'exact',
        path: '/pst/find?searchWord=test&areaId=10790',
      },
    });
    expect(invalidate.statusCode).toBe(201);
    expect(invalidate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        scope: 'exact',
        matched: 1,
        deleted: 1,
      }),
    );

    const third = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=test&areaId=10790',
      headers: {
        accept: '*/*',
        'accept-language': 'de-DE',
      },
    });
    expect(third.statusCode).toBe(200);
    expect(third.headers['x-cache']).toBe('MISS');
  });

  it('supports dryRun invalidation without deleting cache entries', async () => {
    httpClientService.requestRaw.mockResolvedValue(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=dryrun&areaId=10790',
    });

    const cached = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=dryrun&areaId=10790',
    });
    expect(cached.statusCode).toBe(200);
    expect(cached.headers['x-cache']).toBe('HIT');

    const dryRun = await app.inject({
      method: 'POST',
      url: '/internal/cache/invalidate',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        scope: 'exact',
        path: '/pst/find?searchWord=dryrun&areaId=10790',
        dryRun: true,
      },
    });
    expect(dryRun.statusCode).toBe(201);
    expect(dryRun.json()).toEqual(
      expect.objectContaining({
        ok: true,
        dryRun: true,
        matched: 1,
        deleted: 0,
      }),
    );

    const afterDryRun = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=dryrun&areaId=10790',
    });
    expect(afterDryRun.statusCode).toBe(200);
    expect(afterDryRun.headers['x-cache']).toBe('HIT');
  });

  it('invalidates by prefix and all scopes via admin endpoint', async () => {
    httpClientService.requestRaw.mockResolvedValue(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=prefix-a&areaId=10790',
    });
    await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/other?searchWord=prefix-b&areaId=10790',
    });

    const prefixInvalidate = await app.inject({
      method: 'POST',
      url: '/internal/cache/invalidate',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        scope: 'prefix',
        pathPrefix: '/pst/find',
      },
    });
    expect(prefixInvalidate.statusCode).toBe(201);
    expect(prefixInvalidate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        scope: 'prefix',
      }),
    );

    const afterPrefix = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=prefix-a&areaId=10790',
    });
    expect(afterPrefix.statusCode).toBe(200);
    expect(afterPrefix.headers['x-cache']).toBe('MISS');

    const otherPath = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/other?searchWord=prefix-b&areaId=10790',
    });
    expect(otherPath.statusCode).toBe(200);
    expect(otherPath.headers['x-cache']).toBe('HIT');

    const allInvalidate = await app.inject({
      method: 'POST',
      url: '/internal/cache/invalidate',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        scope: 'all',
      },
    });
    expect(allInvalidate.statusCode).toBe(201);
    expect(allInvalidate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        scope: 'all',
      }),
    );

    const afterAll = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/other?searchWord=prefix-b&areaId=10790',
    });
    expect(afterAll.statusCode).toBe(200);
    expect(afterAll.headers['x-cache']).toBe('MISS');
  });

  it('rejects cache invalidation endpoint without admin token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/cache/invalidate',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        scope: 'all',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    httpClientService.requestRaw.mockResolvedValue(buildUpstreamResponse());

    for (let index = 0; index < 5; index += 1) {
      const response = await injectProxy({
        method: 'GET',
        url: `/api/v1/limit-${index}`,
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await injectProxy({
      method: 'GET',
      url: '/api/v1/limit-over',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('returns HIT after a cached MISS', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const first = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=personalausweis%20beantra&areaId=10790',
    });

    expect(first.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=personalausweis%20beantra&areaId=10790',
    });

    expect(second.statusCode).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('returns STALE when cache entry is expired but within stale window', async () => {
    const key = buildProxyCacheKey(
      'GET',
      '/pst/find?searchWord=personalausweis%20beantra&areaId=10790',
      {
        accept: '*/*',
        'accept-language': 'de-DE',
        api_key: 'test-key',
      },
    );
    cacheStore.set(key, {
      value: buildUpstreamResponse(),
      staleUntil: Date.now() - 1000,
      __cacheEntry: true,
    });

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=personalausweis%20beantra&areaId=10790',
      headers: {
        accept: '*/*',
        'accept-language': 'de-DE',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('STALE');
  });

  it('returns BYPASS when authorization header is present', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/pst/find?searchWord=personalausweis%20beantra&areaId=10790',
      headers: {
        authorization: 'Bearer test-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('BYPASS');
  });

  it('forwards api_key header when missing on request', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/api-key',
    });

    expect(response.statusCode).toBe(200);
    expectCacheHeader(response);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/api-key',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'test-key' }),
      }),
    );
  });

  it('forwards POST bodies and headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse({ status: 201 }));

    const response = await injectProxy({
      method: 'POST',
      url: '/api/v1/post?foo=bar',
      headers: {
        authorization: 'Bearer test-token',
        'x-trace-id': 'trace-1',
      },
      payload: { name: 'test' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'POST',
      '/post?foo=bar',
      { name: 'test' },
      expect.objectContaining({
        headers: expect.objectContaining({
          api_key: 'test-key',
          authorization: 'Bearer test-token',
          'x-trace-id': 'trace-1',
        }),
      }),
    );
  });

  it('preserves client api_key header', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/override',
      headers: {
        api_key: 'client-key',
      },
    });

    expect(response.statusCode).toBe(200);
    expectCacheHeader(response);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/override',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'client-key' }),
      }),
    );
  });

  it('filters hop-by-hop headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/headers',
      headers: {
        connection: 'keep-alive',
        host: 'example.com',
        'transfer-encoding': 'chunked',
        'x-forward-me': 'yes',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-forward-me': 'yes' }));
    expect(callOptions?.headers).not.toHaveProperty('connection');
    expect(callOptions?.headers).not.toHaveProperty('host');
    expect(callOptions?.headers).not.toHaveProperty('transfer-encoding');
  });

  it('filters x-forwarded headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/headers-forwarded',
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'x-forwarded-host': 'example.com',
        'x-forwarded-proto': 'https',
        'x-real-ip': '203.0.113.2',
        'x-request-id': 'req-2',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-request-id': 'req-2' }));
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-for');
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-host');
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-proto');
    expect(callOptions?.headers).not.toHaveProperty('x-real-ip');
  });

  it('does not forward client x-api-key header to upstream', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/headers-api-key',
      headers: {
        'x-request-id': 'req-3',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-request-id': 'req-3' }));
    expect(callOptions?.headers).not.toHaveProperty('x-api-key');
  });

  it('filters non-allowlisted headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    await injectProxy({
      method: 'GET',
      url: '/api/v1/headers-block',
      headers: {
        cookie: 'session=abc',
        'x-request-id': 'req-1',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-request-id': 'req-1' }));
    expect(callOptions?.headers).not.toHaveProperty('cookie');
  });

  it('returns upstream non-2xx responses', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(
      buildUpstreamResponse({ status: 404, body: { message: 'not found' } }),
    );

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'not found' });
    expectCacheHeader(response);
  });

  it('forwards accept-language header when provided', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/accept-language',
      headers: {
        'accept-language': 'de-DE',
      },
    });

    expect(response.statusCode).toBe(200);
    expectCacheHeader(response);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/accept-language',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ 'accept-language': 'de-DE' }),
      }),
    );
  });

  it('does not add accept-language when missing', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/accept-language-missing',
    });

    expect(response.statusCode).toBe(200);
    expectCacheHeader(response);

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).not.toHaveProperty('accept-language');
  });

  it('returns empty body for 204 responses', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(
      buildUpstreamResponse({ status: 204, body: null, contentType: null }),
    );

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/empty',
    });

    expect(response.statusCode).toBe(204);
    expect(response.payload).toBe('');
    expectCacheHeader(response);
  });

  it('returns 502 when upstream fails', async () => {
    httpClientService.requestRaw.mockRejectedValueOnce(new Error('boom'));

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1/fail',
    });

    expect(response.statusCode).toBe(502);
  });

  it('forwards requests to the root path', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce(buildUpstreamResponse());

    const response = await injectProxy({
      method: 'GET',
      url: '/api/v1',
    });

    expect(response.statusCode).toBe(200);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/',
      undefined,
      expect.any(Object),
    );
  });

  it('returns 404 for unsupported methods', async () => {
    const response = await injectProxy({
      method: 'PUT',
      url: '/api/v1/unsupported',
    });

    expect(response.statusCode).toBe(404);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });

  it('returns 404 for delete requests', async () => {
    const response = await injectProxy({
      method: 'DELETE',
      url: '/api/v1/unsupported',
    });

    expect(response.statusCode).toBe(404);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });

  it('rejects payloads larger than 1mb by default', async () => {
    const payload = JSON.stringify({ data: 'a'.repeat(1048577) });

    const response = await injectProxy({
      method: 'POST',
      url: '/api/v1/too-large',
      headers: {
        'content-type': 'application/json',
      },
      payload,
    });

    expect(response.statusCode).toBe(413);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });
});
