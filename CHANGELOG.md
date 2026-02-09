# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.6.0

### Added

- Redis-backed client API key registry with lifecycle management (`create/list/revoke/activate/delete`) via internal admin endpoints under `/internal/api-keys`.
- Mandatory client API key protection for proxy routes (`/api/v1/**`) using `x-api-key`.
- Redis-backed fixed-window rate limiting for proxy access, including response headers (`x-ratelimit-*`) and `retry-after` on limit exceed.
- Structured admin audit logging for API key operations without leaking raw secrets.
- New environment settings for API key/rate-limit control and admin access (`API_KEYS_REDIS_PREFIX`, `API_KEYS_RATE_LIMIT_WINDOW_SECONDS`, `API_KEYS_RATE_LIMIT_MAX_REQUESTS`, `ADMIN_API_TOKEN`).
- Insomnia import config for internal API key endpoints (`doc/insomnia/internal-api-keys.insomnia.json`).

### Changed

- Proxy access control now uses a single composed guard to enforce deterministic auth + rate-limit flow.
- Deployment workflow and Quantum compose runtime now inject `ADMIN_API_TOKEN` from secrets.

### Removed

- `ApiKeyAuthGuard` and `ApiKeyRateLimitGuard`, replaced by `ProxyAccessGuard`

## 0.5.0

### Added

- Docker containerization for the NestJS service with a multi-stage `Dockerfile`.
- Local Docker compose setup (`app + redis`) via `docker-compose.local.yml`.
- GitHub Actions CI workflow enhancements with Docker image build validation.
- GitHub Actions production deployment workflow for immutable SHA-tagged image releases.
- Quantum deployment templates (`docker-compose.quantum.yml`, `stack.quantum.yml`, `.quantum`) including Traefik host routing and node placement constraints.
- Deployment runbook for GitHub + Quantum operations.

## 0.4.0

### Added

- Proxy response caching with cache-aside + stale-while-revalidate behavior and `x-cache` response header.
- Cache policy controls: `CACHE_IGNORE_UPSTREAM_CONTROL` and `CACHE_BYPASS_PATHS`.
- Cache diagnostics via `CACHE_DEBUG`.
- E2E coverage for HIT/MISS/STALE/BYPASS cache outcomes.

### Changed

- Cache TTL handling now normalizes for Redis millisecond TTL expectations.
- Proxy caching key includes relevant request headers to avoid variant collisions.

## 0.3.0

### Added

- Upstream API proxy endpoints for GET/POST under `/api/v1`, plus a root GET handler.
- Proxy service to forward requests to the configured upstream API.
- Allowlisted header forwarding (including `x-` headers) and API key injection via `HTTP_CLIENT_API_KEY`.
- `PROXY_BODY_LIMIT` environment variable to cap incoming JSON payload size.
- Proxy endpoint tests and expanded HTTP client test coverage.

### Changed

- HTTP client supports raw response forwarding, uses an undici keep-alive dispatcher, and only retries GET requests.
- Proxy now passes through raw query strings to upstream requests.
- Proxy rejects absolute URL smuggling attempts and enforces JSON-only POST payloads.
- Proxy strips hop-by-hop and `x-forwarded-*` headers before forwarding upstream.

## 0.2.0

### Added

- HTTP client module/service with configurable base URL, timeouts, retries, query params, and JSON handling.
- Redis-backed cache module/service with stale-while-revalidate support, wrap helper, and health checks.
- `/health/cache` endpoint to report cache backend status.
- Environment variables for HTTP client and cache settings, plus example `.env` values.
- Tests covering the HTTP client and cache services.

### Changed

- Env validation expanded for the HTTP client and cache settings.
- README updated with setup, environment, cache usage, and operational notes.
- Tooling configs refreshed (`.nvmrc`, `.tool-versions`, ESLint settings).

## 0.1.0

- Sets the initial backend scaffold with health check, config/tooling, and OpenSpec docs to anchor architecture decisions.
