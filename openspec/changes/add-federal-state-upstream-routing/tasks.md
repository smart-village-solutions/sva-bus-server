## 1. Configuration and resolution

- [x] 1.1 Define known state codes and parse/validate immutable state-upstream subsets.
- [x] 1.2 Replace legacy upstream variables with `HTTP_CLIENT_STATE_UPSTREAMS` startup validation.
- [x] 1.3 Add the shared federal-state upstream resolver and module with unit coverage.

## 2. Proxy routing and credentials

- [x] 2.1 Require and normalize the selector for generic GET and POST proxy routes.
- [x] 2.2 Route with the selected origin and server-owned key while stripping caller credentials
      and the selector.
- [x] 2.3 Require explicit origins in the HTTP client and preserve absolute-URL/origin protections.
- [x] 2.4 Preserve selector-free, credential-free political-area routing through the GD origin.

## 3. Cache isolation and administration

- [x] 3.1 Introduce required non-secret state/GD cache partitions and remove key-derived identity.
- [x] 3.2 Prove cross-state cache separation, same-state cache hits, and absence of fixture secrets.
- [x] 3.3 Migrate strict cache invalidation from API-key input to normalized configured state input
      while retaining cross-state broad invalidation.

## 4. Contract, deployment, and verification

- [x] 4.1 Update unit and e2e tests for valid, malformed, unsupported, and political-area flows.
- [x] 4.2 Replace legacy variables in examples, deployment wiring, and documentation with safe
      placeholders.
- [x] 4.3 Document the breaking client/admin contracts, supported-code semantics, and release
      checklist; update the changelog.
- [x] 4.4 Run build, lint, format, full unit/e2e, strict OpenSpec, whitespace, scope, and
      secret-material gates.
