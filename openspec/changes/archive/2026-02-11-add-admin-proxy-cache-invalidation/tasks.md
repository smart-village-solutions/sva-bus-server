## 1. Implementation

- [x] 1.1 Add cache admin invalidation endpoint `POST /internal/cache/invalidate` protected by `AdminAuthGuard`
- [x] 1.2 Implement cache invalidation service for scopes `exact`, `prefix`, and `all`
- [x] 1.3 Implement `exact` hybrid behavior: broad by default, strict single-key invalidation when `strict=true`
- [x] 1.4 Implement `dryRun` behavior that reports `matched` without deleting keys
- [x] 1.5 Ensure invalidation only targets `proxy:GET:*` keys and never touches API key registry keys
- [x] 1.6 Use Redis `SCAN` + batch `DEL` (no `KEYS`) for safe production operation
- [x] 1.7 Add structured admin audit logging for invalidation requests and outcomes
- [x] 1.8 Wire endpoint into existing modules without breaking current API key/proxy auth flow

## 2. Tests

- [x] 2.1 Add unit tests for cache invalidation service (`exact`, `prefix`, `all`, `dryRun`, Redis unavailable)
- [x] 2.2 Add controller tests for payload validation and guard-protected behavior
- [x] 2.3 Extend e2e tests to verify `MISS -> HIT -> invalidate -> MISS` flow
- [x] 2.4 Add e2e coverage for unauthorized admin calls and `dryRun` behavior

## 3. Documentation

- [x] 3.1 Update `README.md` with endpoint contract and examples
- [x] 3.2 Add/extend Insomnia collection for cache invalidation admin endpoint

## 4. Validation

- [x] 4.1 Run `npm test`
- [x] 4.2 Run `npm run test:e2e`
- [x] 4.3 Run `openspec validate add-admin-proxy-cache-invalidation --strict --no-interactive`
