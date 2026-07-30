# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- Proxy responses no longer forward stale compression metadata after Undici decoded the upstream
  body, preventing empty responses and HTTP/2 framing errors in clients.

## 0.7.2

### Added

- Federal-state upstream routing from the mandatory, case-insensitive `x-federal-state` request
  header, with matched state origin/key selection and state-isolated proxy caching.

### Changed

- **BREAKING** All `/api/v1/**` requests now require a configured federal-state selector.
- Political-area routes keep their fixed GD origin but now use the selected state's upstream key.
- **BREAKING** Runtime configuration now uses the JSON secret `HTTP_CLIENT_STATE_UPSTREAMS` instead
  of the single global upstream origin and API key.
- **BREAKING** Strict cache invalidation now selects a top-level `federalState` and no longer
  accepts `headers.apiKey`; broad exact/prefix invalidation continues across states.

## 0.7.1

### Changed

- Deployment workflow now installs `quantum-cli` via `hostwithquantum/setup-quantum-cli@v1` instead of running the Docker image, simplifying the job and speeding up stack deployments that still use username/password authentication.
- Quantum deployment step now runs a single `quantum-cli stacks update --create --wait --stack "${QUANTUM_STACK}"` command, removes the redundant `stack` fallback, and keeps only the required step-level environment variables.

## 0.7.0

### Added

- Dedicated proxy endpoints for political area search and detail lookups under `/api/v1/political-area/search` and `/api/v1/political-area/:id`.
- PoliticalArea requests route to `https://gd-api.zfinder.de` via a request-specific upstream base URL override instead of the default configured upstream base URL.
- Controller and e2e test coverage for PoliticalArea forwarding, including repeated `searchWords` query parameters and the alternate upstream host selection.
- Admin-protected cache invalidation endpoint at `POST /internal/cache/invalidate` with `exact`, `prefix`, and `all` scopes plus optional `dryRun` preview support.
- Structured audit logging and header-variant fingerprinting for cache invalidation actions, plus unit and e2e coverage for the new admin cache flows.
- Operational documentation and Insomnia examples for proxy cache invalidation, alongside the archived OpenSpec change for the capability.

### Changed

- Proxy cache invalidation now uses production-safe Redis `SCAN` plus batched multi-key `DEL`, restricts deletions to `proxy:GET:*`, and supports broader-by-default `exact` matching with optional `strict=true`.

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
