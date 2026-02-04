import { buildProxyCacheKey, deriveProxyCachePolicy, shouldBypassProxyCache } from './proxy-cache';

describe('proxy cache policy', () => {
  it('bypasses cache for non-2xx responses', () => {
    const policy = deriveProxyCachePolicy({
      status: 500,
      body: { error: 'boom' },
      contentType: 'application/json',
      headers: {},
    });

    expect(policy.cacheable).toBe(false);
  });

  it('respects cache-control no-store and private', () => {
    const noStore = deriveProxyCachePolicy({
      status: 200,
      body: { ok: true },
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
    });

    const isPrivate = deriveProxyCachePolicy({
      status: 200,
      body: { ok: true },
      contentType: 'application/json',
      headers: { 'cache-control': 'private, max-age=60' },
    });

    expect(noStore.cacheable).toBe(false);
    expect(isPrivate.cacheable).toBe(false);
  });

  it('derives ttl from cache-control max-age', () => {
    const policy = deriveProxyCachePolicy({
      status: 200,
      body: { ok: true },
      contentType: 'application/json',
      headers: { 'cache-control': 'max-age=120' },
    });

    expect(policy.cacheable).toBe(true);
    expect(policy.ttlSeconds).toBe(120);
  });

  it('bypasses cache when authorization header is present', () => {
    expect(shouldBypassProxyCache({ authorization: 'Bearer token' }, '/foo', [])).toBe(true);
    expect(shouldBypassProxyCache({}, '/foo', [])).toBe(false);
  });

  it('bypasses cache for configured paths', () => {
    expect(shouldBypassProxyCache({}, '/pst/find', ['/pst'])).toBe(true);
    expect(shouldBypassProxyCache({}, '/other', ['/pst'])).toBe(false);
  });

  it('ignores upstream cache-control when configured', () => {
    const policy = deriveProxyCachePolicy(
      {
        status: 200,
        body: { ok: true },
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
      },
      { ignoreUpstreamControl: true },
    );

    expect(policy.cacheable).toBe(true);
  });
});

describe('buildProxyCacheKey', () => {
  it('generates consistent cache keys for same inputs', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'application/json',
      'accept-language': 'de-DE',
      api_key: 'secret123',
    });
    const key2 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'application/json',
      'accept-language': 'de-DE',
      api_key: 'secret123',
    });

    expect(key1).toBe(key2);
  });

  it('generates different cache keys for different api_key values', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', { api_key: 'secret123' });
    const key2 = buildProxyCacheKey('GET', '/api/test', { api_key: 'secret456' });

    expect(key1).not.toBe(key2);
  });

  it('treats api_key case-sensitively (different cases produce different keys)', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', { api_key: 'Secret123' });
    const key2 = buildProxyCacheKey('GET', '/api/test', { api_key: 'secret123' });

    expect(key1).not.toBe(key2);
  });

  it('handles missing api_key gracefully', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', {});
    const key2 = buildProxyCacheKey('GET', '/api/test', { api_key: '' });

    expect(key1).toBe(key2);
  });

  it('normalizes accept and accept-language headers', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'Application/JSON',
      'accept-language': 'DE-de',
    });
    const key2 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'application/json',
      'accept-language': 'de-de',
    });

    expect(key1).toBe(key2);
  });

  it('does not expose api_key in plaintext in cache key', () => {
    const apiKey = 'my-secret-key';
    const cacheKey = buildProxyCacheKey('GET', '/api/test', { api_key: apiKey });

    expect(cacheKey).not.toContain(apiKey);
    expect(cacheKey).not.toContain(apiKey.toLowerCase());
  });
});
