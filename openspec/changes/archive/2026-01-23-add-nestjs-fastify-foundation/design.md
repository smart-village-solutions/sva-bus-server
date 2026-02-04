## Context

We are starting a new backend codebase to proxy external APIs for a mobile app. The platform must be flexible, production-ready, and easy to evolve without forcing mobile client updates.

## Goals / Non-Goals

- Goals: consistent framework for controllers/modules, fast HTTP adapter, strong DI/testability, common backend patterns.
- Non-Goals: defining caching policy, request/response schemas, or external API mapping rules. (This change only establishes the foundation; proxy behavior comes later.)

## Decisions

- Decision: Use NestJS as the application framework with the Fastify HTTP adapter.
- Alternatives considered: Express-only, Koa, Hapi, or a custom Fastify setup without NestJS. These were deprioritized due to weaker structure or less consistent testing/DI patterns.

## Risks / Trade-offs

- NestJS introduces framework conventions; mitigate via small module boundaries and clear docs.
- Fastify plugin ecosystem differs from Express; mitigate by standardizing adapters and helpers early.

## Migration Plan

- Greenfield only: initialize project with NestJS + Fastify and establish baseline modules.

## Open Questions

- Node.js version baseline: prefer the active LTS line and pin it consistently in tooling (e.g. `package.json#engines`, optional `.nvmrc`).
