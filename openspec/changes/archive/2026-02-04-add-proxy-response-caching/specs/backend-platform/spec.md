## ADDED Requirements

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
