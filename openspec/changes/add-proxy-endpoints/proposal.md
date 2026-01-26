# Change: Add upstream API proxy endpoints

## Why

The backend currently exposes only health endpoints. Clients need a stable proxy layer to call the external API through this service so we can enforce routing, logging, and future caching.

## What Changes

- Add proxy endpoints under a stable base path (e.g., `/api/v1/*`) that forward to the configured upstream API
- Support GET and POST passthrough with query parameters, headers, and JSON payloads, including a configured `api_key` header
- Return upstream responses to clients with consistent error handling for network failures
- Add tests and documentation for proxy usage and expected behavior

## Non-Goals

- Authentication, rate limiting, or allowlist enforcement (handled separately)
- Endpoint-specific caching policies or response transformations
- Streaming or file upload proxying

## Success Criteria

- Requests to `/api/v1/*` are forwarded to `HTTP_CLIENT_BASE_URL` with path and query preserved, including the configured `api_key` header
- GET and POST requests are supported with JSON request/response handling
- Upstream non-2xx responses are returned to the caller; network failures map to 502
- Tests cover success and failure flows

## Impact

- Affected specs: backend-platform
- Affected code: new proxy controller/service, tests, and README updates
