import { deriveProxyCachePolicy, shouldBypassProxyCache } from './proxy-cache';

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
