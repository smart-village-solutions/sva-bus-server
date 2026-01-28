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
- `HTTP_CLIENT_API_KEY`: API key sent as `api_key` header to the upstream API
- `HTTP_CLIENT_TIMEOUT`: Request timeout in milliseconds
- `HTTP_CLIENT_RETRIES`: Retry attempts for upstream calls
- `CACHE_REDIS_URL`: Redis connection string
- `CACHE_TTL_DEFAULT`: Default cache TTL (seconds)
- `CACHE_STALE_TTL`: Stale-while-revalidate window (seconds)

## Health Check

```bash
curl http://localhost:3000/health
```

Cache connectivity check:

```bash
curl http://localhost:3000/health/cache
```

## Proxy Endpoints

Proxy requests to the upstream API via `/api/v1` (forwards allowlisted headers and automatically adds `api_key` header if configured):

```bash
curl "http://localhost:3000/api/v1/test?foo=bar"
```

POST requests forward JSON bodies:

```bash
curl -X POST "http://localhost:3000/api/v1/example" -H "content-type: application/json" -d '{"key":"value"}'
```

Notes:

- The proxy currently has no authentication or rate limiting. Add those before exposing it publicly.
- The proxy always injects the upstream `api_key`, so protect `/api/v1` behind auth/rate limiting or keep it on an internal network.
- The proxy forwards only allowlisted headers (`accept`, `accept-encoding`, `accept-language`, `authorization`, `content-type`, `user-agent`, `api_key`, and `x-*`).

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
