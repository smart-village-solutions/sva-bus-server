# Capability: Backend Platform

## Purpose

Provide a stable, production-oriented NestJS foundation for an API proxy service.
## Requirements
### Requirement: NestJS Fastify foundation

The backend platform SHALL use NestJS with the Fastify adapter as the primary application framework.

#### Scenario: HTTP server uses Fastify

- **WHEN** the service is started
- **THEN** it serves HTTP requests using NestJS on top of Fastify

### Requirement: Node.js + TypeScript runtime

The backend platform SHALL run on Node.js with TypeScript as the implementation language.

#### Scenario: Build produces Node.js runnable output

- **WHEN** the service is built
- **THEN** the compiled JavaScript output is produced for execution on Node.js

### Requirement: Environment-based configuration

The backend platform SHALL support environment-based configuration for runtime settings.

#### Scenario: Configure listening port via environment

- **WHEN** `PORT` is set in the environment
- **THEN** the service listens on the configured port

#### Scenario: Configure log level via environment

- **WHEN** `LOG_LEVEL` is set in the environment
- **THEN** the HTTP server logger uses the configured log level

### Requirement: Health endpoint

The backend platform SHALL expose a health endpoint for liveness checks.

#### Scenario: Health check returns OK

- **WHEN** a client performs `GET /health`
- **THEN** the service responds with HTTP 200 and a JSON body indicating healthy status

### Requirement: Baseline developer tooling

The backend platform SHALL provide baseline developer tooling for formatting, linting, and building.

#### Scenario: Validate code quality locally

- **WHEN** a developer runs formatting and linting scripts
- **THEN** the scripts complete successfully and report issues consistently

#### Scenario: Compile the project

- **WHEN** a developer runs the build script
- **THEN** the TypeScript project compiles without errors

### Requirement: HTTP client with resilient undici wrapper

The backend platform SHALL expose an HttpClientService built on undici with configurable base URL, timeout, and retry behavior.

#### Scenario: HTTP client is available for dependency injection

- **WHEN** a NestJS module requires HTTP calls
- **THEN** the HttpClientService can be injected via the Nest module system

#### Scenario: HTTP client enforces timeout + retry

- **WHEN** a request exceeds the configured timeout or fails transiently
- **THEN** the client aborts the request, applies the configured retry policy, and surfaces a structured error if retries exhaust

#### Scenario: HTTP client honors base URL configuration

- **WHEN** `HTTP_CLIENT_BASE_URL` is provided
- **THEN** relative requests resolve against the configured base URL

#### Scenario: HTTP client honors timeout configuration

- **WHEN** `HTTP_CLIENT_TIMEOUT` is provided
- **THEN** the client uses that timeout for outbound requests

#### Scenario: HTTP client honors retry configuration

- **WHEN** `HTTP_CLIENT_RETRIES` is provided
- **THEN** the client retries requests up to the configured attempt count

### Requirement: Redis-backed caching with SWR

The backend platform SHALL provide a Redis-based cache service with TTL and stale-while-revalidate capabilities.

#### Scenario: Cache service is available for dependency injection

- **WHEN** a module requires caching functionality
- **THEN** the CacheService can be injected via the Nest module system

#### Scenario: Cache connects via configured Redis URL

- **WHEN** `CACHE_REDIS_URL` is set
- **THEN** CacheService establishes its connection using the configured endpoint

#### Scenario: Cache stores, retrieves, and deletes values

- **WHEN** a value is stored with a key and TTL
- **THEN** the same key returns the value before TTL expiry, and deletion removes it immediately

#### Scenario: Cache serves stale data while refreshing

- **WHEN** a cached entry expired but remains within the configured stale window
- **THEN** the cache returns the stale value and triggers a background refresh

#### Scenario: Cache falls back to pass-through when Redis fails

- **WHEN** Redis is unavailable
- **THEN** CacheService logs the failure and allows requests to bypass caching (pass-through)

#### Scenario: Service starts without Redis

- **WHEN** Redis is unavailable at startup
- **THEN** the server initializes with pass-through caching and continues to serve requests

#### Scenario: Redis outage after startup

- **WHEN** Redis becomes unavailable while the server is running
- **THEN** cache operations fall back to pass-through and health reports a degraded status

### Requirement: Configurable TTL and health monitoring

The backend platform SHALL configure cache defaults and provide health visibility through environment variables and health checks.

#### Scenario: Configure cache TTL defaults

- **WHEN** `CACHE_TTL_DEFAULT` or `CACHE_STALE_TTL` are set
- **THEN** CacheService uses those defaults for new entries and stale windows

#### Scenario: Cache health endpoint

- **WHEN** the health endpoint is invoked
- **THEN** it reports Redis connectivity status so operators can detect cache outages

### Requirement: Upstream API proxy endpoints

The backend platform SHALL expose proxy endpoints that forward requests to the configured upstream API base URL.

#### Scenario: Proxy GET request

- **WHEN** a client calls `GET /api/v1/{path}` with query parameters
- **THEN** the service forwards the request to the upstream base URL with the same path, query, and allowlisted headers (including `api_key` header when configured) and returns the upstream response

#### Scenario: Non-allowlisted headers are dropped

- **WHEN** a request includes non-allowlisted headers (e.g., `cookie`)
- **THEN** the proxy omits those headers before calling the upstream API

#### Scenario: Proxy POST request

- **WHEN** a client calls `POST /api/v1/{path}` with a JSON body
- **THEN** the service forwards the request to the upstream base URL with the same path and query (including `api_key` header when configured) and returns the upstream response

#### Scenario: Upstream responds with non-2xx

- **WHEN** the upstream responds with a non-2xx status code
- **THEN** the proxy returns the same status code and response body to the caller

#### Scenario: Upstream request fails

- **WHEN** the upstream request fails due to timeout or network errors
- **THEN** the proxy returns HTTP 502 with an error payload describing the failure

### Requirement: Proxy response caching

The backend platform SHALL cache eligible GET proxy responses using the Redis-backed CacheService with stale-while-revalidate behavior.

#### Scenario: Cache hit serves from Redis

- **WHEN** a GET proxy request matches an existing cache entry
- **THEN** the proxy returns the cached response without calling the upstream API

#### Scenario: Cache miss stores response

- **WHEN** a GET proxy request has no cache entry
- **THEN** the proxy calls the upstream API and stores the response using the configured TTLs

#### Scenario: Stale cache triggers background refresh

- **WHEN** a cached response is stale but still within the configured stale window
- **THEN** the proxy returns the stale response and refreshes the cache in the background

#### Scenario: Non-cacheable responses bypass caching

- **WHEN** a proxy response is non-2xx or marked `no-store`/`private` by upstream
- **THEN** the proxy returns the response without storing it in the cache

#### Scenario: Cache outages fall back to pass-through

- **WHEN** Redis is unavailable
- **THEN** the proxy serves requests via the upstream API without caching

### Requirement: Dockerized runtime artifact

The backend platform SHALL provide a production Docker image artifact for the service runtime.

#### Scenario: Docker image build succeeds

- **WHEN** CI builds the service container
- **THEN** a runnable Docker image is produced from repository sources using the project Dockerfile

#### Scenario: Runtime image excludes development dependencies

- **WHEN** the production Docker image is built
- **THEN** the final runtime image contains only the artifacts and dependencies required to run the service

### Requirement: GitHub Actions continuous integration

The backend platform SHALL provide a GitHub Actions continuous integration workflow for pull requests and trusted branch updates.

#### Scenario: Pull request validation

- **WHEN** a pull request is opened or updated
- **THEN** formatting checks, linting, tests, build validation, and Docker build validation are executed in GitHub Actions

#### Scenario: Main branch validation

- **WHEN** code is pushed to `main`
- **THEN** the same CI quality gates are executed before any deployment workflow is allowed to proceed

### Requirement: Protected production deployment workflow

The backend platform SHALL deploy production releases through a protected GitHub Actions workflow using environment-based approval and image-based delivery.

#### Scenario: Deployment requires environment approval

- **WHEN** a production deployment workflow is triggered from a trusted branch
- **THEN** the workflow waits for required approvers on the `production` environment before executing deployment steps

#### Scenario: Deployment uses immutable image reference

- **WHEN** production deployment executes
- **THEN** the target runtime is updated to the SHA-tagged image built by the same workflow run

#### Scenario: Deployment uses Quantum stack updates

- **WHEN** production deployment executes
- **THEN** the workflow renders Quantum-compatible stack configuration and updates the configured Quantum stack via `quantum-cli`

#### Scenario: Deployment verifies service health

- **WHEN** a deployment finishes
- **THEN** health verification checks are executed and deployment is marked failed if verification does not pass

#### Scenario: Deployment includes Redis runtime dependency

- **WHEN** production deployment executes
- **THEN** the deployment topology provisions both the application runtime and a Redis runtime for cache functionality

### Requirement: Environment-scoped secret and variable governance

The backend platform SHALL separate secret and non-secret runtime configuration in GitHub environment settings and must not expose secrets in repository contents or untrusted workflow contexts.

#### Scenario: Secret usage restricted to protected context

- **WHEN** deployment jobs run in the protected `production` environment
- **THEN** required secrets are loaded from environment-scoped secrets without storing them in repository files

#### Scenario: Untrusted pull requests cannot access deployment secrets

- **WHEN** pull request workflows run from untrusted code contexts
- **THEN** deployment secrets are unavailable and no secret values are emitted to logs

### Requirement: Client API key authentication for proxy routes

The backend platform SHALL require a valid client API key for all requests to `/api/v1/**`.

#### Scenario: Missing client API key

- **WHEN** a client calls `/api/v1/**` without `x-api-key`
- **THEN** the service responds with HTTP 401 and does not call the upstream API

#### Scenario: Invalid client API key

- **WHEN** a client sends an unknown, revoked, or expired `x-api-key`
- **THEN** the service responds with HTTP 401 and does not call the upstream API

#### Scenario: Valid client API key

- **WHEN** a client sends a valid `x-api-key`
- **THEN** the request is proxied to upstream according to existing proxy rules

### Requirement: Redis-backed API key registry

The backend platform SHALL store and validate client API keys using Redis-backed records with hashed key values.

#### Scenario: Create API key record

- **WHEN** an operator creates a new key through the internal admin API
- **THEN** the service stores metadata and hash in Redis and returns the raw key once in the create response

#### Scenario: Revoke or delete API key

- **WHEN** an operator revokes or deletes an existing key
- **THEN** subsequent proxy requests using that key fail with HTTP 401

### Requirement: Per-key rate limiting

The backend platform SHALL enforce per-key request limits on `/api/v1/**` using Redis-backed counters.

#### Scenario: Requests within limit

- **WHEN** a valid key stays within the configured window limit
- **THEN** requests are served normally and rate-limit headers are returned

#### Scenario: Requests exceed limit

- **WHEN** a valid key exceeds `API_KEYS_RATE_LIMIT_MAX_REQUESTS` within the configured window
- **THEN** the service responds with HTTP 429 and includes `retry-after`

### Requirement: Internal API key administration endpoints

The backend platform SHALL expose internal endpoints for API key lifecycle operations secured by a dedicated admin bearer token.

#### Scenario: Unauthorized admin request

- **WHEN** a request to `/internal/api-keys/**` is missing a valid `Authorization: Bearer` token
- **THEN** the service responds with HTTP 401

#### Scenario: Authorized admin request

- **WHEN** a request to `/internal/api-keys/**` includes a valid admin bearer token
- **THEN** the requested lifecycle operation is executed and a success response is returned

### Requirement: Do not forward client authentication key upstream

The backend platform SHALL never forward `x-api-key` to the upstream API.

#### Scenario: Proxy request with client key

- **WHEN** a client sends `x-api-key` with a proxied request
- **THEN** the proxy strips `x-api-key` before forwarding headers upstream

### Requirement: Admin-authenticated proxy cache invalidation

The backend platform SHALL provide an internal admin endpoint to invalidate proxy GET cache entries manually.

#### Scenario: Unauthorized cache invalidation request

- **WHEN** a request to `POST /internal/cache/invalidate` is missing a valid `Authorization: Bearer` token
- **THEN** the service responds with HTTP 401 and no cache keys are deleted

#### Scenario: Exact invalidation (default broad)

- **WHEN** an admin submits `scope=exact` with a `path` and without `strict=true`
- **THEN** the service invalidates all cache variants for that exact path/query target and returns counts for `matched` and `deleted`

#### Scenario: Exact invalidation (strict variant)

- **WHEN** an admin submits `scope=exact`, `strict=true`, and variant-defining headers
- **THEN** the service invalidates only the single exact cache key variant for that request shape

#### Scenario: Prefix invalidation

- **WHEN** an admin submits `scope=prefix` with a `pathPrefix`
- **THEN** the service invalidates matching `proxy:GET:` cache keys under that prefix only

#### Scenario: Global proxy cache invalidation

- **WHEN** an admin submits `scope=all`
- **THEN** the service invalidates all `proxy:GET:*` keys and leaves non-proxy namespaces untouched

#### Scenario: Dry-run invalidation

- **WHEN** an admin submits `dryRun=true`
- **THEN** the service reports matching key count and performs no deletions

#### Scenario: Redis unavailable during invalidation

- **WHEN** the cache backend client is unavailable
- **THEN** the service responds with HTTP 503 and reports invalidation backend unavailable

### Requirement: Safe Redis key scanning for invalidation

The backend platform SHALL use non-blocking Redis key scanning for admin cache invalidation operations.

#### Scenario: Invalidation executes in production-safe pattern

- **WHEN** cache invalidation is executed
- **THEN** the service uses Redis `SCAN` with batched deletion and does not use Redis `KEYS`

