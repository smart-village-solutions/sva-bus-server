## Context

The proxy already exposes GET/POST forwarding and a Redis-backed CacheService with stale-while-revalidate (SWR), but the proxy does not currently use it. We need a consistent cache policy for proxy responses that improves latency and reduces upstream load while remaining safe for future auth scenarios.

## Goals / Non-Goals

- Goals:
  - Cache GET proxy responses in Redis using cache-aside with SWR.
  - Respect upstream cache directives when present.
  - Provide deterministic cache keys that avoid mixing incompatible variants.
  - Keep behavior safe when Redis is unavailable (pass-through).
- Non-Goals:
  - Fine-grained per-endpoint cache configuration.
  - Cache invalidation beyond TTL/SWR.
  - Caching POST requests.

## Decisions

- Cache scope: only `GET` requests.
- Cacheability: cache only successful 2xx responses with a body; skip 204/304 and non-2xx.
- Safety: if an `authorization` header is present on the incoming request, bypass caching to avoid user-specific data leakage.
- Cache directives:
  - If upstream returns `cache-control: no-store` or `private`, bypass caching.
  - If `cache-control` includes `s-maxage` or `max-age`, use that as TTL; otherwise fall back to `CACHE_TTL_DEFAULT`.
- Stale handling: use `CACHE_STALE_TTL` for SWR.
- Cache key: `proxy:{method}:{path}?{query}:{headerFingerprint}` where header fingerprint includes `accept`, `accept-language`, and `api_key` (when present).
- Implementation approach: add a CacheService helper (e.g., `wrapCacheable`) so the SWR logic stays centralized while allowing cache-bypass decisions based on the upstream response.
- Observability: add an `x-cache` response header with `HIT`, `MISS`, `STALE`, or `BYPASS` to aid debugging.

## Risks / Trade-offs

- Cache staleness risk: SWR can serve stale responses briefly. Mitigated by short `CACHE_STALE_TTL` and upstream cache directives.
- Header variability: insufficient keying could mix variants. Mitigated by including common variant headers and bypassing `authorization` requests.

## Migration Plan

- Implement proxy caching behind the existing routes; no client changes required.
- Deploy with default TTLs; adjust via env vars if needed.
- Roll back by disabling cache usage in the proxy if issues arise.

## Open Questions

- Should we also honor upstream `Expires` headers when `cache-control` is absent?
- Do we want a hard max TTL to prevent overly long upstream cache values?
