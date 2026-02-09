## Context

The project is a public GitHub repository and must adopt a CI/CD model that keeps sensitive values out of source control while preserving operational control over production releases. The delivery artifact should be a Docker image and deployment should integrate with existing Quantum platform operations.

## Goals / Non-Goals

- Goals:
  - Centralize CI/CD in GitHub Actions
  - Standardize runtime delivery with Docker images
  - Ensure production deployments are approval-gated
  - Enforce safe secret handling for a public repository
  - Align deployment with Quantum stack operations
- Non-Goals:
  - Full multi-cloud IaC standardization in the first iteration
  - Kubernetes migration

## Decisions

- Decision: Use split workflows (`ci.yml` and `deploy.yml`) with least-privilege permissions.
  - Rationale: Separates untrusted code validation from privileged deployment execution.
- Decision: Build and push immutable SHA-tagged images to GHCR.
  - Rationale: Ensures reproducible deployments and clear rollback references.
- Decision: Require GitHub Environment `production` for deployment with manual approval.
  - Rationale: Prevents automatic production pushes and enforces human gatekeeping.
- Decision: Render Quantum stack config from compose templates and deploy with `quantum-cli`.
  - Rationale: Reuses existing Quantum operations model while keeping deployment source-controlled.
- Decision: Deploy app and Redis together in Quantum stack topology.
  - Rationale: Ensures cache dependency is deployed with the service runtime.

## Risks / Trade-offs

- Risk: Misconfigured workflow triggers could expose privileged contexts.
  - Mitigation: Restrict deployment workflow triggers to trusted branches/events and avoid `pull_request_target` for deployment paths.
- Risk: Secret leakage via rendered configuration artifacts.
  - Mitigation: Keep rendered artifacts short-lived and limit secret use to required fields only.
- Risk: Quantum CLI command differences across versions.
  - Mitigation: Use compatible command fallback (`stacks update` then `stack update`).
- Trade-off: Manual approvals reduce deployment speed.
  - Benefit: Improved production safety and compliance.

## Migration Plan

1. Add spec + tasks and get approval.
2. Introduce Dockerfile and CI Docker build validation.
3. Implement deploy workflow with GHCR push and production environment gate.
4. Add Quantum compose templates and CLI deployment stage.
5. Configure GitHub environment secrets/variables and branch protections.
6. Run controlled production deployment and rollback drill.

## Open Questions

- Whether GHCR pull access should be public or private at organization level remains an operations policy decision.
