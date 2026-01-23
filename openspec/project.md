# Project Context

## Purpose

Provide a stable backend API proxy for a mobile app, enabling controlled access to external APIs, caching, and fast adaptation to upstream changes. The backend will later feed a separate search indexing service.

## Tech Stack

- Node.js 24.13.0 (latest stable LTS)
- TypeScript
- NestJS with Fastify adapter
- Redis (planned, for caching)

## Project Conventions

### Code Style

- TypeScript strict mode enabled
- Prettier for formatting (single quotes, 100 char line width)
- ESLint with @typescript-eslint
- Prefer small, focused modules and clear naming

### Architecture Patterns

- Modular NestJS structure (feature modules, controller + service)
- External API access via dedicated client modules
- Proxy layer is responsible for response shaping and caching

### Observability

- Structured HTTP request logging (level controlled via environment)
- Correlation IDs for request tracing (planned)
- Metrics/tracing via OpenTelemetry (planned)

### Security (Initial)

- Mobile app currently uses the proxy without authentication
- The proxy SHOULD therefore provide abuse protection (rate limiting, timeouts, and strict allowlisting of exposed endpoints)

### Testing Strategy

- Start with unit tests for services and adapters
- Add integration tests for proxy endpoints and cache behavior

### Git Workflow

- Feature branches off main
- PR-based changes for review
- Keep commits small and descriptive

## Domain Context

- External API: https://restapi-v4-bb.infodienste.de
- External API Doc (Swagger): https://restapi-v4-bb.infodienste.de/api-docs
- External API documentations:
  - https://restapi-v4-bb.infodienste.de/doc/index.html
  - https://api.infodienste.de/schnittstellen/id-rest-zufi/
- Mobile app uses the proxy without authentication
- Search indexing service will consume curated content from this backend

## Important Constraints

- No direct external API access from the mobile app
- Proxy must support fast changes without requiring app updates
- Caching must be stable and centrally controlled

## External Dependencies

- Infodienste ZUFI REST API
- Planned search indexing service (details TBD)
