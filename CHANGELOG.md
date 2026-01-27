# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.3.0

### Added

- Upstream API proxy endpoints for GET/POST under `/api/v1`, plus a root GET handler.
- Proxy service to forward requests to the configured upstream API.
- Allowlisted header forwarding (including `x-` headers) and API key injection via `HTTP_CLIENT_API_KEY`.
- Proxy endpoint tests and expanded HTTP client test coverage.

### Changed

- HTTP client supports raw response forwarding, uses an undici keep-alive dispatcher, and only retries GET requests.
- Proxy now passes through raw query strings to upstream requests.

## 0.2.0

### Added

- HTTP client module/service with configurable base URL, timeouts, retries, query params, and JSON handling.
- Redis-backed cache module/service with stale-while-revalidate support, wrap helper, and health checks.
- `/health/cache` endpoint to report cache backend status.
- Environment variables for HTTP client and cache settings, plus example `.env` values.
- Tests covering the HTTP client and cache services.

### Changed

- Env validation expanded for the HTTP client and cache settings.
- README updated with setup, environment, cache usage, and operational notes.
- Tooling configs refreshed (`.nvmrc`, `.tool-versions`, ESLint settings).

## 0.1.0

- Sets the initial backend scaffold with health check, config/tooling, and OpenSpec docs to anchor architecture decisions.
