# bb-bus-server

Backend foundation for the API proxy, built on NestJS + Fastify.

## Requirements

- Node.js 22.x LTS (22.12.0 recommended)
- npm

## Getting Started

```bash
npm install
npm run start:dev
```

The server starts on `http://localhost:3000` by default.

## Environment

Copy the example file and adjust values as needed:

```bash
cp .env.example .env
```

### Required settings

- `HTTP_CLIENT_BASE_URL`: Base URL for upstream API calls
- `HTTP_CLIENT_BASE_URL` must be origin-only (no path segment), so `/api/v1/*` maps 1:1 to upstream paths
- `HTTP_CLIENT_TIMEOUT`: Request timeout in milliseconds
- `HTTP_CLIENT_RETRIES`: Retry attempts for upstream calls
- `CACHE_REDIS_URL`: Redis connection string
- `CACHE_TTL_DEFAULT`: Default cache TTL (seconds; converted to ms for Redis stores)
- `CACHE_STALE_TTL`: Stale-while-revalidate window (seconds)

### Optional settings

- `HTTP_CLIENT_API_KEY`: API key sent as `api_key` header to the upstream API when the client does not provide one
- `PROXY_BODY_LIMIT`: Max JSON body size in bytes (default: 1048576)
- `CACHE_IGNORE_UPSTREAM_CONTROL`: Ignore upstream `cache-control` directives and use local TTLs (default: false)
- `CACHE_BYPASS_PATHS`: Comma-separated list of path prefixes that should never be cached (default: empty)
- `CACHE_DEBUG`: Enable cache debug logging (default: false)
- `API_KEYS_REDIS_PREFIX`: Redis key prefix for client API keys + rate limits (default: `api-keys`)
- `API_KEYS_RATE_LIMIT_WINDOW_SECONDS`: Rate-limit window length in seconds (default: `60`)
- `API_KEYS_RATE_LIMIT_MAX_REQUESTS`: Max requests per API key and window (default: `120`)
- `ADMIN_API_TOKEN`: Bearer token for internal API key admin endpoints (`/internal/api-keys`)

## Health Check

```bash
curl http://localhost:3000/health
```

Health endpoints report the proxy application's status (and cache) only; they are intentionally not part of the versioned upstream API.

Cache connectivity check:

```bash
curl http://localhost:3000/health/cache
```

## Proxy Endpoints

Proxy requests to the upstream API via `/api/v1` (forwards allowlisted headers and automatically adds `api_key` header if configured):

Versioning applies only to proxied upstream requests; service health endpoints remain unversioned.

The upstream base URL must be origin-only (no path segment) so proxy routes can map directly to upstream paths.

```bash
curl "http://localhost:3000/api/v1/test?foo=bar" \
  -H "x-api-key: <client-api-key>"
```

POST requests forward JSON bodies:

```bash
curl -X POST "http://localhost:3000/api/v1/example" \
  -H "x-api-key: <client-api-key>" \
  -H "content-type: application/json" \
  -d '{"key":"value"}'
```

Notes:

- `/api/v1/**` requires a valid client API key via `x-api-key`.
- API keys are stored in Redis (hashed) and validated before proxying.
- Rate limiting is enforced per API key and backed by Redis counters.
- The same rate-limit settings also apply to pre-auth and admin endpoints.
- If Redis is unavailable, `/api/v1/**` returns 503 because API key validation cannot be performed (fail-closed).
- Admin operations for API keys are exposed under `/internal/api-keys` and protected with `Authorization: Bearer <ADMIN_API_TOKEN>`.
- Admin cache invalidation is exposed under `/internal/cache/invalidate` and protected with `Authorization: Bearer <ADMIN_API_TOKEN>`.
- The proxy injects the upstream `api_key` only when the client does not already provide one.
- The proxy forwards only allowlisted headers (`accept`, `accept-encoding`, `accept-language`, `authorization`, `content-type`, `user-agent`, `api_key`, and `x-*`).
- `x-api-key` is never forwarded to upstream.

### Proxy Caching

GET responses are cached in Redis using cache-aside with stale-while-revalidate. The proxy honors upstream
`cache-control` headers when deciding whether to cache and for how long.

Caching rules:

- Only GET responses with 2xx status are cached (204/304 are skipped).
- Upstream `cache-control: no-store` or `private` responses are not cached.
- `s-maxage` or `max-age` determines the TTL when present; otherwise defaults to `CACHE_TTL_DEFAULT`.
- Requests with an `authorization` header bypass caching.
- `CACHE_IGNORE_UPSTREAM_CONTROL=true` ignores upstream cache directives and always uses local TTLs.
- `CACHE_BYPASS_PATHS` entries (e.g. `/health`) are never cached.

Cache-relevant GET responses include an `x-cache` header with `HIT`, `MISS`, `STALE`, or `BYPASS` to make cache behavior easier to trace.
When `CACHE_DEBUG=true`, responses also include `x-cache-key-hash` (hashed cache key fingerprint) to help correlate cache variants without exposing raw cache keys.

### Manual Cache Invalidation (Admin)

Manual invalidation targets proxy GET cache keys only (`proxy:GET:*`).

```bash
curl -X POST "http://localhost:3000/internal/cache/invalidate" \
  -H "authorization: Bearer <ADMIN_API_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"scope":"exact","path":"/pst/find?areaId=10790"}'
```

Supported scopes:

- `exact`: invalidate one path/query target (`strict=false` default invalidates all variants for that path)
- `prefix`: invalidate all keys under a path prefix (`pathPrefix`)
- `all`: invalidate all proxy GET cache keys

Optional fields:

- `dryRun: true`: only report `matched`, do not delete keys
- `strict: true` + `headers` on `exact`: invalidate exactly one variant by key-shaping headers (`accept`, `acceptLanguage`, `apiKey`)

Response shape:

```json
{
  "ok": true,
  "scope": "exact",
  "dryRun": false,
  "matched": 1,
  "deleted": 1
}
```

## Cache Usage Example

```ts
import { Injectable } from '@nestjs/common';
import { CacheService } from './cache/cache.service';

@Injectable()
export class ExampleService {
  constructor(private readonly cacheService: CacheService) {}

  async getExampleValue(): Promise<string> {
    return this.cacheService.wrap('example:key', async () => {
      return 'fresh-value';
    });
  }
}
```

## Operational Notes

- Redis is the primary cache backend. When Redis is unavailable, the service stays up and cache operations become no-ops (pass-through to the upstream API).
- `/health/cache` reports `degraded` when Redis is unreachable, so monitoring can detect outages.

## Useful Scripts

- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run format`
- Format check (CI): `npm run format:check`
