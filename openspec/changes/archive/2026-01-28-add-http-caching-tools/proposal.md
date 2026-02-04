# Change: Add HTTP client and Redis-based caching foundation

## Why

The backend needs to proxy external APIs (TSA Infodienste API) and cache responses efficiently. We need standardized tools for making HTTP requests and managing cache storage with TTL support.

## What Changes

- Add undici as the HTTP client library with timeout + retry support
- Add cache-manager with a Redis store for shared caching (plus optional stale responses)
- Ensure Redis outages fall back to pass-through caching so the server stays available
- Provide NestJS modules/services that encapsulate HTTP access and cache behavior (Cache-Aside + SWR)
- Add environment-driven configuration for base URL, timeouts, TTLs, stale TTL, and Redis connection
- Establish health checks and documentation for using the new services

## Non-Goals

- Implementing specific API proxy endpoints (handled separately)
- Per-endpoint cache policy definitions (will come with individual proxy routes)
- Advanced invalidation mechanisms beyond TTL + manual delete (e.g., event-driven busting)
- Per-user cache variation (all cache entries are shared)

## Success Criteria

- undici-based HttpClientService provides GET/POST helpers with configurable timeout/retry
- Redis-backed CacheService exposes `get/set/del/wrap` with TTL + stale-while-revalidate support
- Server remains available if Redis is unavailable; cache bypasses and health degrades
- Default env config: `HTTP_CLIENT_BASE_URL`, `HTTP_CLIENT_TIMEOUT`, `HTTP_CLIENT_RETRIES`, `CACHE_REDIS_URL`, `CACHE_TTL_DEFAULT`, `CACHE_STALE_TTL`
- Health check covers Redis connectivity
- `npm run build`, `npm run test`, and `npm run test:e2e` succeed with new modules & tests covering cache + HTTP behavior

## Rollout / Backout

- Rollout: deploy new modules alongside existing functionality; caching is opt-in for feature modules
- Backout: revert commit if build/tests fail or Redis is not yet available (services degrade to pass-through)

## Impact

- Affected specs: backend-platform
- Affected code: new modules for HTTP client and cache management, updated package.json
