import { ServiceUnavailableException } from '@nestjs/common';

import { buildProxyCacheKey } from '../proxy/proxy-cache';
import { CacheService } from './cache.service';
import { CacheAdminService } from './cache-admin.service';

type MockRedisClient = {
  scan: jest.Mock;
  del: jest.Mock;
};

describe('CacheAdminService', () => {
  let service: CacheAdminService;
  let redisKeys: Set<string>;
  let redisClient: MockRedisClient;
  let cacheService: { getStoreClient: jest.Mock };

  const toRegex = (pattern: string): RegExp => {
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

  beforeEach(() => {
    redisKeys = new Set<string>();

    redisClient = {
      scan: jest.fn(async (_cursor: string, options: { MATCH: string }) => {
        const matcher = toRegex(options.MATCH);
        const keys = [...redisKeys].filter((key) => matcher.test(key));
        return ['0', keys];
      }),
      del: jest.fn(async (...keys: string[]) => {
        let deleted = 0;
        keys.forEach((key) => {
          if (redisKeys.delete(key)) {
            deleted += 1;
          }
        });
        return deleted;
      }),
    };

    cacheService = {
      getStoreClient: jest.fn().mockReturnValue(redisClient),
    };

    service = new CacheAdminService(cacheService as unknown as CacheService);
  });

  it('invalidates all variants for exact path by default', async () => {
    redisKeys.add('proxy:GET:/pst/find?areaId=10790:variant-a');
    redisKeys.add('proxy:GET:/pst/find?areaId=10790:variant-b');
    redisKeys.add('proxy:GET:/pst/find?areaId=42:variant-c');

    await expect(
      service.invalidate({
        scope: 'exact',
        path: '/pst/find?areaId=10790',
      }),
    ).resolves.toEqual({
      scope: 'exact',
      dryRun: false,
      matched: 2,
      deleted: 2,
    });

    expect(redisKeys.has('proxy:GET:/pst/find?areaId=42:variant-c')).toBe(true);
  });

  it('invalidates only strict cache key when strict=true', async () => {
    const targetKey = buildProxyCacheKey('GET', '/pst/find?areaId=10790', {
      accept: '*/*',
      'accept-language': 'de-DE',
      api_key: 'client-A',
    });
    const otherVariant = buildProxyCacheKey('GET', '/pst/find?areaId=10790', {
      accept: '*/*',
      'accept-language': 'en-US',
      api_key: 'client-A',
    });

    redisKeys.add(targetKey);
    redisKeys.add(otherVariant);

    await expect(
      service.invalidate({
        scope: 'exact',
        path: '/pst/find?areaId=10790',
        strict: true,
        headers: {
          accept: '*/*',
          acceptLanguage: 'de-DE',
          apiKey: 'client-A',
        },
      }),
    ).resolves.toEqual({
      scope: 'exact',
      dryRun: false,
      matched: 1,
      deleted: 1,
    });

    expect(redisKeys.has(targetKey)).toBe(false);
    expect(redisKeys.has(otherVariant)).toBe(true);
  });

  it('returns matched=0 for strict dryRun when key does not exist', async () => {
    await expect(
      service.invalidate({
        scope: 'exact',
        path: '/pst/find?areaId=99999',
        strict: true,
        dryRun: true,
        headers: {
          accept: '*/*',
          acceptLanguage: 'de-DE',
          apiKey: 'missing-client',
        },
      }),
    ).resolves.toEqual({
      scope: 'exact',
      dryRun: true,
      matched: 0,
      deleted: 0,
    });
  });

  it('returns matched=0 for strict delete when key does not exist', async () => {
    await expect(
      service.invalidate({
        scope: 'exact',
        path: '/pst/find?areaId=99999',
        strict: true,
        headers: {
          accept: '*/*',
          acceptLanguage: 'de-DE',
          apiKey: 'missing-client',
        },
      }),
    ).resolves.toEqual({
      scope: 'exact',
      dryRun: false,
      matched: 0,
      deleted: 0,
    });
  });

  it('invalidates only matching prefix keys', async () => {
    redisKeys.add('proxy:GET:/pst/find?areaId=10790:variant-a');
    redisKeys.add('proxy:GET:/pst/find/details?areaId=10790:variant-b');
    redisKeys.add('proxy:GET:/other/path?x=1:variant-c');

    await expect(
      service.invalidate({
        scope: 'prefix',
        pathPrefix: '/pst/find',
      }),
    ).resolves.toEqual({
      scope: 'prefix',
      dryRun: false,
      matched: 2,
      deleted: 2,
    });

    expect(redisKeys.has('proxy:GET:/other/path?x=1:variant-c')).toBe(true);
  });

  it('invalidates all proxy GET keys only', async () => {
    redisKeys.add('proxy:GET:/a:1');
    redisKeys.add('proxy:GET:/b:2');
    redisKeys.add('api-keys:key:123');

    await expect(
      service.invalidate({
        scope: 'all',
      }),
    ).resolves.toEqual({
      scope: 'all',
      dryRun: false,
      matched: 2,
      deleted: 2,
    });

    expect(redisKeys.has('api-keys:key:123')).toBe(true);
  });

  it('supports dryRun without deletion', async () => {
    redisKeys.add('proxy:GET:/pst/find?areaId=10790:variant-a');

    await expect(
      service.invalidate({
        scope: 'exact',
        path: '/pst/find?areaId=10790',
        dryRun: true,
      }),
    ).resolves.toEqual({
      scope: 'exact',
      dryRun: true,
      matched: 1,
      deleted: 0,
    });

    expect(redisKeys.has('proxy:GET:/pst/find?areaId=10790:variant-a')).toBe(true);
    expect(redisClient.del).not.toHaveBeenCalled();
  });

  it('throws 503 when redis client is unavailable', async () => {
    cacheService.getStoreClient.mockReturnValueOnce(null);

    await expect(
      service.invalidate({
        scope: 'all',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deletes keys in multi-key batches instead of per-key deletes', async () => {
    for (let index = 0; index < 250; index += 1) {
      redisKeys.add(`proxy:GET:/bulk/${index}:variant`);
    }

    await expect(
      service.invalidate({
        scope: 'prefix',
        pathPrefix: '/bulk',
      }),
    ).resolves.toEqual({
      scope: 'prefix',
      dryRun: false,
      matched: 250,
      deleted: 250,
    });

    expect(redisClient.del).toHaveBeenCalledTimes(3);
    expect(redisClient.del.mock.calls[0]?.length).toBe(100);
    expect(redisClient.del.mock.calls[1]?.length).toBe(100);
    expect(redisClient.del.mock.calls[2]?.length).toBe(50);
  });
});
