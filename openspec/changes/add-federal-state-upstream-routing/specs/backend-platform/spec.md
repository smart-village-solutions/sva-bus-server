## MODIFIED Requirements

### Requirement: HTTP client with resilient undici wrapper

The backend platform SHALL expose an HttpClientService built on undici that requires an explicit
origin-only base URL per request and applies configurable timeout and retry behavior.

#### Scenario: HTTP client is available for dependency injection

- **WHEN** a NestJS module requires HTTP calls
- **THEN** the HttpClientService can be injected via the Nest module system

#### Scenario: HTTP client enforces timeout + retry

- **WHEN** a request exceeds the configured timeout or fails transiently
- **THEN** the client aborts the request, applies the configured retry policy, and surfaces a
  structured error if retries exhaust

#### Scenario: HTTP client requires an explicit request origin

- **WHEN** a relative request is made without a request-specific base URL
- **THEN** the client rejects it instead of using a process-wide fallback

#### Scenario: HTTP client rejects unsafe origins and paths

- **WHEN** a request supplies an absolute proxy path or a base URL that is not an origin-only URL
- **THEN** the client rejects the request before making an upstream call

#### Scenario: HTTP client honors timeout configuration

- **WHEN** `HTTP_CLIENT_TIMEOUT` is provided
- **THEN** the client uses that timeout for outbound requests

#### Scenario: HTTP client honors retry configuration

- **WHEN** `HTTP_CLIENT_RETRIES` is provided
- **THEN** the client retries requests up to the configured attempt count

### Requirement: Upstream API proxy endpoints

The backend platform SHALL route every generic `/api/v1/**` Infodienste request to the configured
origin and server-owned API key selected by its mandatory `x-federal-state` header.

#### Scenario: Every configured state can be selected

- **WHEN** a client calls a generic proxy route with any configured known federal-state code
- **THEN** the service forwards the request using that state's matched origin and API key

#### Scenario: Selector normalization is case-insensitive

- **WHEN** a client sends a configured federal-state code using lowercase or mixed case
- **THEN** the service normalizes it to uppercase and selects the same state entry

#### Scenario: Missing selector is rejected before routing

- **WHEN** a generic request omits `x-federal-state` or supplies a blank or malformed header
- **THEN** the service responds with HTTP 400 without accessing cache or calling upstream

#### Scenario: Unknown selector is rejected before routing

- **WHEN** a generic request supplies a code outside the 16 known German federal-state codes
- **THEN** the service responds with HTTP 400 without accessing cache or calling upstream

#### Scenario: Unconfigured selector is rejected before routing

- **WHEN** a generic request supplies a known state code absent from the current configuration
- **THEN** the service responds with HTTP 400 without accessing cache or calling upstream

#### Scenario: Proxy GET request

- **WHEN** a client calls `GET /api/v1/{path}` with a configured state and query parameters
- **THEN** the service forwards the same path, query, allowlisted headers, and selected
  server-owned `api_key` to that state's origin and returns the upstream response

#### Scenario: Proxy POST request

- **WHEN** a client calls `POST /api/v1/{path}` with a configured state and JSON body
- **THEN** the service forwards the same path, query, body, allowlisted headers, and selected
  server-owned `api_key` to that state's origin and returns the upstream response

#### Scenario: Routing headers and caller credentials are stripped

- **WHEN** a client sends `x-federal-state`, client authentication `x-api-key`, or an `api_key`
  header
- **THEN** none is forwarded as caller-controlled data and only the selected server-owned
  `api_key` is sent upstream

#### Scenario: Non-allowlisted headers are dropped

- **WHEN** a request includes non-allowlisted headers such as `cookie`
- **THEN** the proxy omits those headers before calling the upstream API

#### Scenario: Upstream responds with non-2xx

- **WHEN** the selected upstream responds with a non-2xx status code
- **THEN** the proxy returns the same status code and response body to the caller

#### Scenario: Upstream request fails

- **WHEN** the selected upstream request fails due to timeout or network errors
- **THEN** the proxy returns HTTP 502 with an error payload describing the failure

#### Scenario: Political-area routes use the selected state key

- **WHEN** a client calls `/api/v1/political-area/search` or `/api/v1/political-area/{id}` with a
  configured `x-federal-state`
- **THEN** the service uses `https://gd-api.zfinder.de` and sends the selected state's Infodienste
  `api_key`

### Requirement: Proxy response caching

The backend platform SHALL cache eligible GET proxy responses using Redis-backed stale-while-
revalidate behavior and a required non-secret partition identifying the normalized state.

#### Scenario: Cache hit serves from Redis

- **WHEN** a GET proxy request matches path, query, representation headers, and cache partition
- **THEN** the proxy returns the cached response without calling the upstream API

#### Scenario: Cache miss stores response

- **WHEN** a GET proxy request has no entry matching path, query, representation headers, and
  cache partition
- **THEN** the proxy calls the upstream API and stores the response using the configured TTLs

#### Scenario: State-separated caching

- **WHEN** two requests have identical paths and representation headers but select different
  configured states
- **THEN** they use different cache entries and each request resolves through its selected
  upstream

#### Scenario: Cache identity contains no upstream secret

- **WHEN** a proxy cache key is constructed
- **THEN** it contains the normalized state partition but no raw or derived upstream API key

#### Scenario: Stale cache triggers background refresh

- **WHEN** a cached response is stale but still within the configured stale window
- **THEN** the proxy returns the stale response and refreshes the same partition in the background

#### Scenario: Non-cacheable responses bypass caching

- **WHEN** a proxy response is non-2xx or marked `no-store` or `private` by upstream
- **THEN** the proxy returns the response without storing it in the cache

#### Scenario: Cache outages fall back to pass-through

- **WHEN** Redis is unavailable
- **THEN** the proxy serves requests via the selected upstream API without caching

### Requirement: Admin-authenticated proxy cache invalidation

The backend platform SHALL provide an internal admin endpoint that invalidates proxy GET cache
entries, using a configured federal state rather than an upstream credential for strict
Infodienste variants.

#### Scenario: Unauthorized cache invalidation request

- **WHEN** a request to `POST /internal/cache/invalidate` is missing a valid `Authorization:
  Bearer` token
- **THEN** the service responds with HTTP 401 and no cache keys are deleted

#### Scenario: Exact invalidation default broad

- **WHEN** an admin submits `scope=exact` with a `path` and without `strict=true`
- **THEN** the service invalidates all state and representation variants for that exact path/query
  target and returns counts for `matched` and `deleted`

#### Scenario: Exact invalidation strict state variant

- **WHEN** an admin submits `scope=exact`, `strict=true`, a configured `federalState`, and
  variant-defining representation headers
- **THEN** the service normalizes the state and invalidates only that single state and
  representation cache key without accepting an upstream API key

#### Scenario: Strict invalidation rejects unsupported state

- **WHEN** strict invalidation supplies an unknown or known-but-unconfigured state
- **THEN** the service responds with HTTP 400 and deletes no cache keys

#### Scenario: Prefix invalidation

- **WHEN** an admin submits `scope=prefix` with a `pathPrefix`
- **THEN** the service invalidates matching `proxy:GET:` cache keys under that prefix across all
  state partitions

#### Scenario: Global proxy cache invalidation

- **WHEN** an admin submits `scope=all`
- **THEN** the service invalidates all `proxy:GET:*` keys and leaves non-proxy namespaces untouched

#### Scenario: Dry-run invalidation

- **WHEN** an admin submits `dryRun=true`
- **THEN** the service reports matching key count and performs no deletions

#### Scenario: Redis unavailable during invalidation

- **WHEN** the cache backend client is unavailable
- **THEN** the service responds with HTTP 503 and reports invalidation backend unavailable

## ADDED Requirements

### Requirement: Federal-state upstream configuration

The backend platform SHALL derive its operationally supported federal states solely from a
required non-empty `HTTP_CLIENT_STATE_UPSTREAMS` JSON object whose entries pair an origin-only
HTTPS URL with a non-empty server-owned API key.

#### Scenario: Supported states derive from configuration

- **WHEN** startup receives a valid non-empty subset of the 16 known state codes
- **THEN** exactly those configured keys are operationally supported without requiring entries for
  omitted known states

#### Scenario: Invalid startup configuration is rejected

- **WHEN** the configuration is malformed JSON, empty, contains an unknown code, has a malformed
  entry or empty key, or includes a non-HTTPS/non-origin URL
- **THEN** startup fails without logging or returning any supplied API key
