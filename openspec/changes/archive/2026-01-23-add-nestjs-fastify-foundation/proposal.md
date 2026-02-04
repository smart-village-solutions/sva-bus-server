# Change: Select NestJS + Fastify foundation

## Why

We need a stable backend foundation that can evolve independently from the mobile app, support proxying external APIs, and provide consistent patterns for caching and future services.

## What Changes

- Adopt NestJS with the Fastify adapter as the primary backend framework.
- Standardize on Node.js + TypeScript for runtime and build tooling.
- Establish a minimal baseline structure (bootstrap, modules, and configuration) for all future backend work.

## Non-Goals

- Implementing external API proxy endpoints and mapping rules
- Defining caching policy (TTL/SWR) and cache invalidation
- Adding authentication/authorization for mobile clients

## Success Criteria

- `npm run build` succeeds
- `npm run start:dev` starts the service without errors
- `GET /health` returns HTTP 200 with a healthy JSON payload
- `npm run lint` and `npm run format:check` succeed

## Rollout / Backout

- Rollout: greenfield only, deploy the new service scaffold
- Backout: revert to the previous commit / remove scaffold if needed

## Impact

- Affected specs: backend-platform
- Affected code: new NestJS/Fastify project scaffold, base modules, runtime configuration
