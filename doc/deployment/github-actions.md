# GitHub Actions Deployment Runbook (Quantum: App + Redis)

This project uses GitHub Actions for CI/CD with protected production deployments and Docker image delivery to Planetary Quantum.

## Workflows

- `CI` (`.github/workflows/ci.yml`): runs format check, lint, unit tests, build, and Docker build validation on pull requests and pushes to `main`.
- `Deploy Production` (`.github/workflows/deploy.yml`): runs preflight checks, builds and pushes an image to GHCR, requires `production` environment approval, renders `quantum.yml`, and deploys via `quantum-cli`.

## Quantum Deployment Files

- `docker-compose.quantum.yml`: base services (`bus-api` + `redis`) with runtime configuration.
- `stack.quantum.yml`: deployment overlays (Traefik routing labels, deploy policies).
- `.quantum`: Quantum CLI project descriptor pointing to `quantum.yml`.

## Required GitHub Repository Setup

1. Configure branch protection for `main` and require CI checks.
2. Create GitHub Environment `production` and add required reviewers.
3. Restrict deployment branch policy to `main`.
4. Allow Actions workflow permissions to write packages (for GHCR push).

## Production Environment Secrets

- `QUANTUM_USER`: Quantum login user
- `QUANTUM_PASSWORD`: Quantum login password
- `HTTP_CLIENT_BASE_URL`: required upstream API base URL (origin-only)
- `HTTP_CLIENT_API_KEY`: optional upstream API key injected into app runtime

## Production Environment Variables

- `QUANTUM_ENDPOINT`: target Quantum endpoint identifier (for example `sva`)
- `QUANTUM_STACK`: stack name (for example `bus-api`)
- `QUANTUM_HOST`: optional Quantum host override if required by your platform setup
- `QUANTUM_NODE`: required target node hostname constraint (for example `node-002.sva`)
- `PUBLIC_DOMAIN`: public domain used by Traefik host rule, for example `bus-api.example.org`
- `HEALTHCHECK_URL`: URL called after deploy, for example `https://bus-api.example.org/health`
- `LOG_LEVEL`: optional, default `info`
- `HTTP_CLIENT_TIMEOUT`: optional, default `10000`
- `HTTP_CLIENT_RETRIES`: optional, default `2`
- `PROXY_BODY_LIMIT`: optional, default `1048576`
- `CACHE_TTL_DEFAULT`: optional, default `300`
- `CACHE_STALE_TTL`: optional, default `60`
- `CACHE_IGNORE_UPSTREAM_CONTROL`: optional, default `false`
- `CACHE_BYPASS_PATHS`: optional, default `/health`
- `CACHE_DEBUG`: optional, default `false`

## Redis Runtime

Redis is deployed with the app stack and app runtime uses:

- `CACHE_REDIS_URL=redis://redis:6379`

This value is enforced in `docker-compose.quantum.yml` for production stack rendering.

## Security Rules

- Never store secrets in repository files.
- Never use deployment secrets in pull request workflows.
- Keep deployment gated by `production` environment approvals.
- Prefer SHA-tagged immutable image deployments (already implemented).

## Health Verification

After deployment, the workflow checks `HEALTHCHECK_URL` with retries. Deployment fails if health does not recover.

## Rollback

Rollback is performed by redeploying a previous known-good commit SHA, which re-renders `quantum.yml` and updates the stack to that immutable image tag.

## E2E Pipeline Validation (OpenSpec Task 5.3)

Datum: 10.02.2026
Umgebung: `production`

### 1) Success-Szenario (Deploy + Verify erfolgreich)

- Workflow: `Deploy Production`
- Run-ID/Link: https://github.com/smart-village-solutions/sva-bus-server/actions/runs/21833051113/attempts/1
- Commit-SHA: `4e3bf15018a3b61c345b1b1c7fabf0c7d21d039a`
- Image-Ref (GHCR): `ghcr.io/smart-village-solutions/sva-bus-server:4e3bf15018a3b61c345b1b1c7fabf0c7d21d039a`
- Ergebnis:
  - [x] `Preflight and Build Image` erfolgreich
  - [x] `Deploy to Quantum` erfolgreich
  - [x] `Verify health endpoint` erfolgreich
- Checks:
  - [x] `https://bus-api.smart-village.app/health` liefert 200
  - [x] `https://bus-api.smart-village.app/health/cache` liefert 200

### 2) Failure-Szenario (falsche HEALTHCHECK_URL)

- Workflow: `Deploy Production`
- Run-ID/Link: https://github.com/smart-village-solutions/sva-bus-server/actions/runs/21858108306/attempts/1
- Commit-SHA: `4e3bf15018a3b61c345b1b1c7fabf0c7d21d039a`
- Manipulation: `HEALTHCHECK_URL` absichtlich falsch gesetzt (`https://bus-api.smart-village.app/healthy`)
- Erwartung:
  - Deploy/Stack-Update kann erfolgreich sein
  - `Verify health endpoint` schlägt fehl (`exit code 1`)
- Ergebnis:
  - [x] Fehler im Schritt `Verify health endpoint` aufgetreten
  - [x] Fehlermeldung dokumentiert "Health check failed" - "The requested URL returned error: 404"
- Checks:
  - [x] `https://bus-api.smart-village.app/health` liefert 200
  - [x] `https://bus-api.smart-village.app/health/cache` liefert 200

### 3) Rollback-Drill (Re-run mit vorheriger erfolgreichem Versuch)

- Workflow: `Deploy Production`
- Run-ID/Link: https://github.com/smart-village-solutions/sva-bus-server/actions/runs/21833051113/attempts/2
- Commit-SHA: `4e3bf15018a3b61c345b1b1c7fabf0c7d21d039a`
- Ergebnis:
  - [x] `Preflight and Build Image` erfolgreich
  - [x] `Deploy to Quantum` erfolgreich
  - [x] `Verify health endpoint` erfolgreich
- Checks:
  - [x] `https://bus-api.smart-village.app/health` liefert 200
  - [x] `https://bus-api.smart-village.app/health/cache` liefert 200
