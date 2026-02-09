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

