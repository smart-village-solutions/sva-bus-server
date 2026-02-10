# Change: Add Admin Proxy Cache Invalidation

## Why

The upstream API does not provide reliable change indicators (for example ETag or webhook updates), so stale proxy cache entries can persist longer than acceptable. Operations needs a controlled manual mechanism to invalidate proxy cache entries without flushing unrelated Redis data.

## What Changes

- Add a new admin-protected endpoint `POST /internal/cache/invalidate`.
- Support three invalidation scopes for proxy GET cache keys:
  - `exact` (default broad by `path`, optional `strict=true` for exact variant)
  - `prefix`
  - `all`
- Support `dryRun` mode to report matches without deleting.
- Reuse existing `AdminAuthGuard` security and audit context (`adminIdentity`, IP, request ID).
- Add logging for cache invalidation audit events.
- Add unit and e2e coverage for success and failure paths.

## Impact

- Affected specs: `backend-platform`
- Affected code:
  - `src/cache/*` (new cache admin service/controller)
  - module wiring for internal endpoint exposure
  - `test/proxy.e2e-spec.ts`
  - `README.md`
  - `doc/insomnia/*.json`
