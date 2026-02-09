## 1. API Key Module & Security Guards

- [x] 1.1 Add `ApiKeysModule` with Redis-backed `ApiKeysService` for key validation and lifecycle management
- [x] 1.2 Add `ApiKeyAuthGuard` for mandatory `x-api-key` validation on `/api/v1/**`
- [x] 1.3 Add `ApiKeyRateLimitGuard` for per-key request throttling
- [x] 1.4 Add `AdminAuthGuard` for `/internal/api-keys/**` using bearer admin token

## 2. Proxy Integration

- [x] 2.1 Wire API key guards into proxy routes
- [x] 2.2 Block forwarding of `x-api-key` to upstream
- [x] 2.3 Keep existing upstream `api_key` injection behavior unchanged

## 3. Admin API

- [x] 3.1 Add endpoints to create/list/revoke/activate/delete client API keys
- [x] 3.2 Store only hashed API key values in Redis and return raw key only at creation time

## 4. Config & Docs

- [x] 4.1 Add env validation for API key/rate-limit/admin-token settings
- [x] 4.2 Update `.env.example` and README usage/security sections

## 5. Tests

- [x] 5.1 Add unit tests for `ApiKeysService`
- [x] 5.2 Extend e2e tests for missing key, admin auth, key lifecycle, rate limit, and header forwarding safety
