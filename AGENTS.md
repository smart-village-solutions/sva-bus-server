<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Project Guidelines

## Code Style

- Language: TypeScript (strict). See [tsconfig.json](tsconfig.json).
- Formatting/Linting: Prettier + ESLint. Use `npm run format`, `npm run lint` (see [package.json](package.json)).
- Tests: Jest unit tests (`*.spec.ts`) + e2e tests in [test/](test/) (see [jest.config.ts](jest.config.ts), [jest.config.e2e.ts](jest.config.e2e.ts)).
- Code reviews: Bitte Review-Kommentare auf Deutsch formulieren (siehe [.github/copilot-instructions.md](.github/copilot-instructions.md)).

## Architecture

- NestJS + Fastify bootstrap in [src/main.ts](src/main.ts); modules wired in [src/app.module.ts](src/app.module.ts).
- Core modules: HTTP client ([src/http-client/](src/http-client/)), cache ([src/cache/](src/cache/)), proxy ([src/proxy/](src/proxy/)), health ([src/health/](src/health/)).
- Routing: `/health` is unversioned; upstream proxy is versioned under `/api/v1/**` (see [src/proxy/proxy.controller.ts](src/proxy/proxy.controller.ts)).

## Build and Test

- Install: `npm install`
- Dev: `npm run start:dev`
- Build/Run: `npm run build` then `npm run start`
- Unit/E2E: `npm test`, `npm run test:e2e`

## Project Conventions

- Env validation is Joi-based; add/adjust env vars only via [src/config/env.validation.ts](src/config/env.validation.ts).
- Upstream base URL must be origin-only (no path). Proxy rejects absolute URLs in paths (see [src/http-client/http-client.service.ts](src/http-client/http-client.service.ts), [src/proxy/proxy.controller.ts](src/proxy/proxy.controller.ts)).
- Header handling is allowlist-based; keep request/response allowlists consistent with existing rules (see [src/proxy/proxy.controller.ts](src/proxy/proxy.controller.ts), [src/http-client/http-client.service.ts](src/http-client/http-client.service.ts)).
- API key injection: server adds `api_key` only if the client didn’t send one (see [src/proxy/proxy.controller.ts](src/proxy/proxy.controller.ts)).
- Proxy caching (GET): Redis cache-aside with stale-while-revalidate + `x-cache` tracing (see [src/proxy/proxy.service.ts](src/proxy/proxy.service.ts), [src/proxy/proxy-cache.ts](src/proxy/proxy-cache.ts)).
- Cache keys must not contain raw secrets: API keys are hashed (see [src/proxy/proxy-cache.ts](src/proxy/proxy-cache.ts)).

## Integration Points

- Upstream: `HTTP_CLIENT_BASE_URL`, optional `HTTP_CLIENT_API_KEY`, plus timeout/retries (see [README.md](README.md), [src/http-client/http-client.service.ts](src/http-client/http-client.service.ts)).
- Redis: `CACHE_REDIS_URL` and TTL settings. Redis down => cache becomes no-op/pass-through (see [src/cache/cache.module.ts](src/cache/cache.module.ts), [src/cache/cache.service.ts](src/cache/cache.service.ts)).

## Security

- Proxy has no auth/rate limiting; protect `/api/v1` before public exposure (see [README.md](README.md)).
- Requests with `authorization` bypass caching to avoid shared-cache leaks (see [src/proxy/proxy-cache.ts](src/proxy/proxy-cache.ts)).
