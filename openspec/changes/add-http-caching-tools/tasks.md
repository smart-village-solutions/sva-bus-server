## 1. Dependencies & Configuration

- [x] 1.1 Install `undici`, `@nestjs/cache-manager`, `cache-manager`, `cache-manager-redis-yet`, and `@redis/client`
- [x] 1.2 Add configuration schema (ConfigModule) for HTTP + cache env vars (`HTTP_CLIENT_BASE_URL`, `HTTP_CLIENT_TIMEOUT`, `HTTP_CLIENT_RETRIES`, `CACHE_REDIS_URL`, `CACHE_TTL_DEFAULT`, `CACHE_STALE_TTL`)
- [x] 1.3 Update `.env.example`, README, and OpenSpec project context with the new settings

## 2. HTTP Client Module

- [x] 2.1 Create `HttpClientModule` exporting `HttpClientService`
- [x] 2.2 Implement undici-based helpers (GET/POST) with timeout + retry (configurable via env)
- [x] 2.3 Support AbortSignal + structured logging when upstream fails
- [x] 2.4 Unit-test retry/timeout behavior with mocked undici

## 3. Cache Module

- [x] 3.1 Create `CacheModule` registering cache-manager with Redis store (and optional in-memory fallback)
- [x] 3.2 Implement `CacheService` with `get`, `set`, `del`, `wrap`, and stale-while-revalidate options
- [x] 3.3 Wire TTL defaults and stale TTL from config; ensure pass-through when Redis unavailable
- [x] 3.4 Add health indicator (e.g., `/health/cache` or Terminus indicator)
- [x] 3.5 Unit + integration tests (mock Redis client) covering TTL expiry, stale responses, manual delete

## 4. Integration

- [x] 4.1 Register both modules in `AppModule` and expose `CacheService` to future feature modules
- [x] 4.2 Add sample provider demonstrating cache-aside usage (doc snippet + optional smoke test)
- [x] 4.3 Verify `npm run build`, `npm run test`, `npm run test:e2e` succeed
- [x] 4.4 Document operational considerations (Redis requirement, fallback, TTL defaults)
