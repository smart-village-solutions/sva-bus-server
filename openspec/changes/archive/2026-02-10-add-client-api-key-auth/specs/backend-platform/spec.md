## ADDED Requirements

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
