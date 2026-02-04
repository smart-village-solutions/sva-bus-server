## ADDED Requirements

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
