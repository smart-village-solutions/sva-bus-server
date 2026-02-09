# Change: Add Redis-backed client API key authentication and rate limiting

## Why

The proxy is currently reachable without client authentication, which allows unauthorized parties to consume upstream capacity through the service. We need strict API key enforcement on `/api/v1` plus per-key throttling to reduce abuse risk and protect upstream systems.

## What Changes

- Require `x-api-key` for all `/api/v1/**` requests
- Validate client API keys against Redis-stored hashed records
- Add Redis-backed fixed-window rate limiting per API key
- Add internal admin endpoints to create/list/revoke/activate/delete API keys
- Protect admin endpoints with `Authorization: Bearer <ADMIN_API_TOKEN>`
- Ensure `x-api-key` is never forwarded upstream
- Add unit and e2e coverage for auth, admin lifecycle, and throttling behavior

## Non-Goals

- OAuth/JWT based end-user auth
- External API gateway integration
- Per-route custom rate limit policies in this change

## Impact

- Affected specs: backend-platform
- Affected code: `src/api-keys/*`, `src/proxy/*`, `src/config/env.validation.ts`, `README.md`, `.env.example`, e2e/unit tests
