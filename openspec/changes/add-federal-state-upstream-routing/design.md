## Context

Infodienste content and credentials are scoped by German federal state. The current process-wide
origin and key cannot select correct content for endpoints that lack an `areaId` selector.
Routing, credential ownership, cache identity, and administrative invalidation must move together
so content cannot leak or collide across states.

## Goals / Non-Goals

- Goals:
  - select one configured origin/key pair for every generic Infodienste request;
  - reject ambiguous or unsupported requests before cache or upstream access;
  - keep upstream credentials server-owned and absent from cache identity and logs;
  - preserve the fixed political-area origin while authenticating it with the selected state key.
- Non-Goals:
  - infer a state from `areaId`, request bodies, or other content;
  - provide a default state or compatibility fallback;
  - support runtime credential editing, per-state retry/TTL settings, or client changes here;
  - deploy or call real upstream services as part of implementation.

## Decisions

1. Generic Infodienste requests require `x-federal-state`. The syntactically known,
   case-insensitive codes are `BB`, `BE`, `BW`, `BY`, `HB`, `HE`, `HH`, `MV`, `NI`, `NW`, `RP`,
   `SH`, `SL`, `SN`, `ST`, and `TH`; internal values are uppercase. A known code is operationally
   supported only if configured.
2. State selection never uses `areaId`, query parameters, or request payloads. This keeps one
   explicit routing rule and covers endpoints such as `pstCategory`.
3. `HTTP_CLIENT_STATE_UPSTREAMS` is a required, non-empty JSON object keyed by a subset of the 16
   codes. Each entry is exactly `{ "baseUrl": "<origin-only HTTPS URL>", "apiKey":
   "<non-empty secret>" }`. Its keys are the single source of truth for supported states; no
   second supported-state list exists.
4. Startup fails for malformed JSON, an empty map, unknown state codes, malformed entries, empty
   keys, non-HTTPS origins, credentials/query/fragment in origins, or paths other than `/`.
   Deployments need to configure only states that are actually available.
5. The server owns upstream credentials. Inbound `x-api-key` authenticates the client but is never
   forwarded; inbound `api_key` is also discarded. Only the selected entry supplies upstream
   `api_key`.
6. Cache identity includes the normalized state partition and never a raw or derived upstream API
   key. Audit text and logs likewise contain no raw key.
7. A syntactically valid but unconfigured state returns HTTP 400 before cache lookup or upstream
   access, as do missing, blank, malformed, and unknown selectors.
8. `/api/v1/political-area/search` and `/api/v1/political-area/:id` use the fixed
   `https://gd-api.zfinder.de` origin, but require `x-federal-state` and receive the selected
   state's Infodienste key. Their cache entries use the same state partition as generic routes.
9. The migration removes `HTTP_CLIENT_BASE_URL`, `HTTP_CLIENT_API_KEY`, default-state behavior,
   and caller-supplied upstream keys. There is no silent fallback.

## Rejected Alternatives

- Select by `areaId`: not all relevant endpoints accept it, and it would create competing routing
  rules.
- Silently default to Brandenburg: preserves availability by returning potentially incorrect
  content.
- Accept a caller-provided upstream `api_key`: breaks server ownership and permits origin/key
  mismatches.
- Put raw keys in cache keys: exposes secrets and makes cache identity credential-dependent.
- Create 16 state-specific controllers: duplicates routing logic and turns operational state
  availability into a code-deployment concern.

## Risks / Trade-offs

- Existing generic clients will receive HTTP 400 after server migration unless the client rollout
  is coordinated. Mitigation: block production until compatible clients are ready.
- JSON secret delivery may be constrained by the deployment platform. Mitigation: verify secret
  storage and passing before changing production configuration.
- Cache namespace changes make existing entries unreachable. Mitigation: accept a cold logical
  cache namespace unless operations requires an explicit invalidation/migration plan.
- Strict invalidation changes from API-key input to federal-state input. Mitigation: confirm
  operational consumers can migrate atomically.

## Migration Plan

1. Implement and verify parsing, resolution, routing, cache partitioning, and strict invalidation.
2. Replace legacy deployment variables with `HTTP_CLIENT_STATE_UPSTREAMS` placeholders and secret
   wiring.
3. Coordinate a compatible mobile-client release that sends `x-federal-state` on every generic
   request.
4. Configure only available state origin/key pairs in the deployment secret store.
5. Deploy to staging and run the release checklist below.
6. Roll out to production only after all release gates pass. Roll back the server and client
   contract together if state routing is not correct.

## Release Checklist

This checklist is operational and separate from implementation completion:

- Coordinate a mobile-client release that sends the selector on every generic request.
- Configure exactly the available states and credentials in the deployment secret store.
- Deploy to staging.
- Smoke-test two configured states, using `BB` and `RP` when both are available, against
  `pstCategory/find`; verify each returns its own state content/data source.
- Call both political-area routes with each configured `x-federal-state`; verify success from the
  GD origin using the matching state-specific key.

## Open Questions

- None for implementation. The availability of configured states remains a release-time
  operational check.
