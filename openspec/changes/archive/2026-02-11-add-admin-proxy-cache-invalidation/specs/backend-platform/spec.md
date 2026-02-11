## ADDED Requirements

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
