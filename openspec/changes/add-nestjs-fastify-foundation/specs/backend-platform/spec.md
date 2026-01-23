## ADDED Requirements

### Requirement: NestJS Fastify foundation

The backend platform SHALL use NestJS with the Fastify adapter as the primary application framework.

#### Scenario: Create a new backend service

- **WHEN** a new backend service is initialized
- **THEN** it uses NestJS with the Fastify adapter for HTTP handling

### Requirement: TypeScript Node.js runtime

The backend platform SHALL run on Node.js with TypeScript as the implementation language.

#### Scenario: Build and run the service

- **WHEN** the service is built and started
- **THEN** the runtime uses Node.js and TypeScript compilation outputs

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
