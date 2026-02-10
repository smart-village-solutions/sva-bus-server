## ADDED Requirements

### Requirement: Dockerized runtime artifact

The backend platform SHALL provide a production Docker image artifact for the service runtime.

#### Scenario: Docker image build succeeds

- **WHEN** CI builds the service container
- **THEN** a runnable Docker image is produced from repository sources using the project Dockerfile

#### Scenario: Runtime image excludes development dependencies

- **WHEN** the production Docker image is built
- **THEN** the final runtime image contains only the artifacts and dependencies required to run the service

### Requirement: GitHub Actions continuous integration

The backend platform SHALL provide a GitHub Actions continuous integration workflow for pull requests and trusted branch updates.

#### Scenario: Pull request validation

- **WHEN** a pull request is opened or updated
- **THEN** formatting checks, linting, tests, build validation, and Docker build validation are executed in GitHub Actions

#### Scenario: Main branch validation

- **WHEN** code is pushed to `main`
- **THEN** the same CI quality gates are executed before any deployment workflow is allowed to proceed

### Requirement: Protected production deployment workflow

The backend platform SHALL deploy production releases through a protected GitHub Actions workflow using environment-based approval and image-based delivery.

#### Scenario: Deployment requires environment approval

- **WHEN** a production deployment workflow is triggered from a trusted branch
- **THEN** the workflow waits for required approvers on the `production` environment before executing deployment steps

#### Scenario: Deployment uses immutable image reference

- **WHEN** production deployment executes
- **THEN** the target runtime is updated to the SHA-tagged image built by the same workflow run

#### Scenario: Deployment uses Quantum stack updates

- **WHEN** production deployment executes
- **THEN** the workflow renders Quantum-compatible stack configuration and updates the configured Quantum stack via `quantum-cli`

#### Scenario: Deployment verifies service health

- **WHEN** a deployment finishes
- **THEN** health verification checks are executed and deployment is marked failed if verification does not pass

#### Scenario: Deployment includes Redis runtime dependency

- **WHEN** production deployment executes
- **THEN** the deployment topology provisions both the application runtime and a Redis runtime for cache functionality

### Requirement: Environment-scoped secret and variable governance

The backend platform SHALL separate secret and non-secret runtime configuration in GitHub environment settings and must not expose secrets in repository contents or untrusted workflow contexts.

#### Scenario: Secret usage restricted to protected context

- **WHEN** deployment jobs run in the protected `production` environment
- **THEN** required secrets are loaded from environment-scoped secrets without storing them in repository files

#### Scenario: Untrusted pull requests cannot access deployment secrets

- **WHEN** pull request workflows run from untrusted code contexts
- **THEN** deployment secrets are unavailable and no secret values are emitted to logs
