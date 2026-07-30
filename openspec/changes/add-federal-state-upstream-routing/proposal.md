# Change: Route Infodienste requests by federal state

## Why

Infodienste serves federal-state-specific content, and some endpoints cannot be scoped through an
`areaId`. The current single Brandenburg origin and API key can therefore return factually wrong
content for clients requesting another state.

## What Changes

- **BREAKING** Require `x-federal-state` on every generic `/api/v1/**` Infodienste request and
  reject missing, unknown, or known-but-unconfigured selectors with HTTP 400.
- Select a matched, server-owned upstream origin and API key from the
  `HTTP_CLIENT_STATE_UPSTREAMS` configuration after normalizing the selector.
- **BREAKING** Remove `HTTP_CLIENT_BASE_URL` and `HTTP_CLIENT_API_KEY`; configured state entries
  become the sole source of supported states, origins, and upstream credentials.
- Strip `x-federal-state`, the client authentication header `x-api-key`, and caller-provided
  `api_key` before forwarding, then add only the selected server-owned upstream key.
- Partition proxy cache entries and strict cache invalidation by normalized federal-state code
  without including upstream secrets in cache keys.
- Keep `/api/v1/political-area/search` and `/api/v1/political-area/:id` independent: they use the
  fixed `https://gd-api.zfinder.de` origin, require no state selector, and receive no Infodienste
  key.
- Coordinate deployment with a client release that sends the selector and replace the two legacy
  deployment secrets with the new JSON secret map.

## Impact

- Affected specs: `backend-platform`
- Affected code: runtime configuration, HTTP client, proxy routing and caching, cache
  administration, unit/e2e tests
- Affected operations: environment examples, deployment workflow and compose configuration,
  release documentation and changelog
- Client migration: generic requests fail with HTTP 400 until clients send a configured
  `x-federal-state`; there is deliberately no compatibility fallback
