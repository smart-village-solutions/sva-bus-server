## ADDED Requirements

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
