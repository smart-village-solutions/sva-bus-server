# Change: Add proxy response caching with Redis

## Why

The cache foundation (Redis + CacheService) exists, but proxy traffic still hits the upstream API for every request. This increases latency and upstream load even when responses are stable. We should activate cache-aside behavior in the proxy layer so GET requests can be served from Redis with stale-while-revalidate support.

## What Changes

- Add cache-aside behavior to the proxy for GET requests using the existing CacheService
- Define a cache key strategy that accounts for path, query, and relevant headers
- Respect upstream cache directives when deciding whether and how long to cache responses
- Store full upstream responses (status, headers, content-type, body) in Redis
- Add tests covering cache hit/miss/stale behavior and pass-through when cache is unavailable

## Non-Goals

- Per-endpoint cache tuning (handled later as specific routes are introduced)
- Cache invalidation beyond TTL/SWR
- POST request caching

## Impact

- Affected specs: backend-platform
- Affected code: `src/proxy/*`, `src/cache/*`, tests for proxy/cache behavior
