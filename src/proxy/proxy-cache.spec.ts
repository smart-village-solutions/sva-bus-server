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
  it('builds cache key with method and path', () => {
    const key = buildProxyCacheKey('GET', '/api/test');
    expect(key).toContain('proxy:GET:/api/test:');
  });

  it('includes normalized headers in cache key', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'application/json',
      'accept-language': 'en-US',
    });
    const key2 = buildProxyCacheKey('GET', '/api/test', {
      accept: 'application/xml',
      'accept-language': 'en-US',
    });

    expect(key1).not.toBe(key2);
  });

  it('does not expose API key in cleartext', () => {
    const apiKey = 'secret-api-key-12345';
    const key = buildProxyCacheKey('GET', '/api/test', {
      api_key: apiKey,
    });

    // Cache key should not contain the cleartext API key
    expect(key).not.toContain(apiKey);
    expect(key).not.toContain('secret-api-key');
  });

  it('generates different cache keys for different API keys', () => {
    const key1 = buildProxyCacheKey('GET', '/api/test', {
      api_key: 'key-1',
    });
    const key2 = buildProxyCacheKey('GET', '/api/test', {
      api_key: 'key-2',
    });

    // Different API keys should produce different cache keys
    expect(key1).not.toBe(key2);
  });

  it('generates same cache key for same API key', () => {
    const apiKey = 'consistent-key';
    const key1 = buildProxyCacheKey('GET', '/api/test', {
      api_key: apiKey,
    });
    const key2 = buildProxyCacheKey('GET', '/api/test', {
      api_key: apiKey,
    });

    // Same API key should produce same cache key
    expect(key1).toBe(key2);
  });

  it('handles missing API key', () => {
    const key = buildProxyCacheKey('GET', '/api/test');
    expect(key).toContain('proxy:GET:/api/test:');
  });
});
