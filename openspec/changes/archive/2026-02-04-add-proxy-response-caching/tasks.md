## 1. Cache Policy & Utilities

- [x] 1.1 Define a cache policy helper to decide cacheability and TTL based on upstream headers and response status
- [x] 1.2 Implement a cache key builder for proxy requests (path, query, and relevant headers)
- [x] 1.3 Extend CacheService with a cache-aside helper that supports SWR and cache-bypass decisions

## 2. Proxy Integration

- [x] 2.1 Inject CacheService into ProxyService and wire CacheModule into ProxyModule
- [x] 2.2 Apply cache-aside behavior for GET requests using the cache policy and key builder
- [x] 2.3 Add `x-cache` response header to indicate HIT/MISS/STALE/BYPASS

## 3. Tests

- [x] 3.1 Unit-test cache policy decisions (TTL parsing, cacheability rules)
- [x] 3.2 Unit-test ProxyService cache hit/miss/stale/bypass behavior
- [x] 3.3 Add or update integration/e2e tests to validate proxy caching behavior

## 4. Documentation

- [x] 4.1 Update README or docs to describe proxy cache behavior and configuration
