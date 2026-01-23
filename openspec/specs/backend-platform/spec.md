# Capability: Backend Platform

## Purpose

Provide a stable, production-oriented NestJS foundation for an API proxy service.

## Requirements

### Requirement: NestJS Fastify foundation

The backend platform SHALL use NestJS with the Fastify adapter as the primary application framework.

#### Scenario: HTTP server uses Fastify

- **WHEN** the service is started
- **THEN** it serves HTTP requests using NestJS on top of Fastify

### Requirement: Node.js + TypeScript runtime

The backend platform SHALL run on Node.js with TypeScript as the implementation language.

#### Scenario: Build produces Node.js runnable output

- **WHEN** the service is built
- **THEN** the compiled JavaScript output is produced for execution on Node.js

### Requirement: Environment-based configuration

The backend platform SHALL support environment-based configuration for runtime settings.

#### Scenario: Configure listening port via environment

- **WHEN** `PORT` is set in the environment
- **THEN** the service listens on the configured port

#### Scenario: Configure log level via environment

- **WHEN** `LOG_LEVEL` is set in the environment
- **THEN** the HTTP server logger uses the configured log level

### Requirement: Health endpoint

The backend platform SHALL expose a health endpoint for liveness checks.

#### Scenario: Health check returns OK

- **WHEN** a client performs `GET /health`
- **THEN** the service responds with HTTP 200 and a JSON body indicating healthy status

### Requirement: Baseline developer tooling

The backend platform SHALL provide baseline developer tooling for formatting, linting, and building.

#### Scenario: Validate code quality locally

- **WHEN** a developer runs formatting and linting scripts
- **THEN** the scripts complete successfully and report issues consistently

#### Scenario: Compile the project

- **WHEN** a developer runs the build script
- **THEN** the TypeScript project compiles without errors
