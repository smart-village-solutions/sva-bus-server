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

- `HTTP_CLIENT_STATE_UPSTREAMS`: Non-empty JSON object mapping configured federal-state codes to
  exactly one origin-only HTTPS `baseUrl` and non-empty server-owned `apiKey`. The configured keys
  are the supported states for this deployment.
- `HTTP_CLIENT_TIMEOUT`: Request timeout in milliseconds
- `HTTP_CLIENT_RETRIES`: Retry attempts for upstream calls
- `CACHE_REDIS_URL`: Redis connection string
- `CACHE_TTL_DEFAULT`: Default cache TTL (seconds; converted to ms for Redis stores)
- `CACHE_STALE_TTL`: Stale-while-revalidate window (seconds)

### Optional settings

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

Proxy requests to Infodienste via `/api/v1` select a matched upstream origin and server-owned key
using the mandatory `x-federal-state` header:

Versioning applies only to proxied upstream requests; service health endpoints remain unversioned.

Recognized codes are `BB`, `BE`, `BW`, `BY`, `HB`, `HE`, `HH`, `MV`, `NI`, `NW`, `RP`, `SH`,
`SL`, `SN`, `ST`, and `TH`. Values are case-insensitive, but only codes present in
`HTTP_CLIENT_STATE_UPSTREAMS` are supported by a deployment. Missing, unknown, or known but
unconfigured selectors return HTTP 400 before cache or upstream access.

```bash
curl "http://localhost:3000/api/v1/test?foo=bar" \
  -H "x-api-key: <client-api-key>" \
  -H "x-federal-state: BB"
```

POST requests forward JSON bodies:

```bash
curl -X POST "http://localhost:3000/api/v1/example" \
  -H "x-api-key: <client-api-key>" \
  -H "x-federal-state: RP" \
  -H "content-type: application/json" \
  -d '{"key":"value"}'
```

Political area endpoints are exposed as dedicated proxy routes:

```bash
curl "http://localhost:3000/api/v1/political-area/search?searchWords=Bad&searchWords=Bel*" \
  -H "x-api-key: <client-api-key>" \
  -H "x-federal-state: BB"

curl "http://localhost:3000/api/v1/political-area/11111" \
  -H "x-api-key: <client-api-key>" \
  -H "x-federal-state: BB"
```

Notes:

- `/api/v1/**` requires a valid client API key via `x-api-key`.
- Generic `/api/v1/**` Infodienste requests also require a configured `x-federal-state`.
- API keys are stored in Redis (hashed) and validated before proxying.
- Rate limiting is enforced per API key and backed by Redis counters.
- The same rate-limit settings also apply to pre-auth and admin endpoints.
- If Redis is unavailable, `/api/v1/**` returns 503 because API key validation cannot be performed (fail-closed).
- Admin operations for API keys are exposed under `/internal/api-keys` and protected with `Authorization: Bearer <ADMIN_API_TOKEN>`.
- Admin cache invalidation is exposed under `/internal/cache/invalidate` and protected with `Authorization: Bearer <ADMIN_API_TOKEN>`.
- `x-api-key` authenticates the caller with this proxy and is distinct from hidden,
  state-specific Infodienste credentials.
- Caller-supplied `x-api-key`, `api_key`, and `x-federal-state` headers are stripped before
  forwarding; the proxy adds only the selected server-owned upstream `api_key`.
- The proxy forwards only allowlisted representation, content, authorization, user-agent, and
  custom trace headers.
- The proxy handles upstream decompression itself and therefore does not forward `accept-encoding`
  or return stale `content-encoding` metadata.
- `/api/v1/political-area/search` and `/api/v1/political-area/:id` always use
  `https://gd-api.zfinder.de`, but still require `x-federal-state` so the proxy can send the
  matching state-specific Infodienste `api_key`.
- `/api/v1/political-area/search` preserves repeated `searchWords` parameters as repeated upstream query parameters.

### Proxy Caching

GET responses are cached in Redis using cache-aside with stale-while-revalidate. The proxy honors upstream
`cache-control` headers when deciding whether to cache and for how long.
Cache identity includes the normalized federal-state partition and never an upstream API key.

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

- `exact`: invalidate one path/query target (`strict=false` default invalidates all state and
  representation variants for that path)
- `prefix`: invalidate all keys under a path prefix (`pathPrefix`) across configured states
- `all`: invalidate all proxy GET cache keys

Optional fields:

- `dryRun: true`: only report `matched`, do not delete keys
- `strict: true` + top-level `federalState` on `exact`: invalidate exactly one configured state
  and representation variant. Optional `headers` may contain `accept` and `acceptLanguage`;
  upstream API keys are not accepted.

Strict example:

```bash
curl -X POST "http://localhost:3000/internal/cache/invalidate" \
  -H "authorization: Bearer <ADMIN_API_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"scope":"exact","path":"/pst/find?areaId=10790","strict":true,"federalState":"BB","headers":{"accept":"application/json","acceptLanguage":"de-DE"}}'
```

Non-strict exact and prefix invalidations intentionally span all configured state partitions.

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

### Release Checklist

This operational checklist is separate from implementation completion:

- Coordinate a mobile-client release that sends `x-federal-state` on every generic request.
- Configure exactly the available states and credentials in the deployment secret store.
- Deploy to staging.
- Smoke-test two configured states, using `BB` and `RP` when both are available, against
  `pstCategory/find`; verify each returns its own state content/data source.
- Call both political-area routes with each configured `x-federal-state`; verify success from the
  GD origin with the matching state-specific credential.

## Useful Scripts

- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run format`
- Format check (CI): `npm run format:check`
