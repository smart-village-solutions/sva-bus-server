# Change: Add Docker-based GitHub Actions CI/CD with protected Quantum deployments

## Why

The repository is hosted on GitHub, but deployment governance is currently fragmented across external systems. We need a single, auditable CI/CD pipeline in GitHub that supports a public repository without exposing secrets while standardizing runtime delivery through Docker images and Quantum stack updates.

## What Changes

- Add GitHub Actions CI workflow for formatting, linting, tests, build, and Docker build validation on pull requests and main branch pushes
- Add GitHub Actions deployment workflow for production with GitHub Environment protection, manual approval gate, and image-based release delivery
- Containerize the service with a production-ready Dockerfile and Docker ignore rules
- Use GHCR image publishing and Quantum CLI-based stack rollout (`bus-api + redis`) for production deployments
- Define environment variable and secret handling rules for public repositories (strict separation of non-secret variables vs. secrets)
- Add Quantum-focused deployment operations documentation for GitHub-based delivery

## Non-Goals

- Migrating runtime architecture to Kubernetes in this iteration
- Introducing application-level auth/rate-limiting changes as part of this CI/CD change
- Defining provider-specific IaC for every possible hoster in this initial rollout

## Impact

- Affected specs: backend-platform
- Affected code: `Dockerfile`, `.dockerignore`, `.github/workflows/*`, `docker-compose.quantum.yml`, `stack.quantum.yml`, deployment docs
