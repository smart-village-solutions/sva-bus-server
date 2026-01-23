# bb-bus-server

Backend foundation for the API proxy, built on NestJS + Fastify.

## Requirements

- Node.js 24.13.0 (latest stable LTS)
- npm

## Getting Started

```bash
npm install
npm run start:dev
```

The server starts on `http://localhost:3000` by default.

## Environment

Copy the example file and adjust values as needed:

```bash
cp .env.example .env
```

## Health Check

```bash
curl http://localhost:3000/health
```

## Useful Scripts

- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run format`
- Format check (CI): `npm run format:check`
