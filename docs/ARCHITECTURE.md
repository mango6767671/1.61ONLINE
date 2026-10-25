# Architecture

## Project boundary

This repository is an independent server implementation. It must not contain leaked, decompiled, copied, or otherwise unauthorized Rockstar source code, proprietary server code, credentials, game assets, or private service protocols. Compatibility work must be based on independently authored code and lawful, observable behavior. Do not impersonate Rockstar services or use Rockstar credentials.

## Current foundation

- **HTTP API:** Fastify, versioned under `/v1`.
- **Identity:** email/password accounts; Argon2id password hashes; short-lived signed access tokens.
- **Persistence:** PostgreSQL.
- **Validation:** Zod at request boundaries.
- **Operational endpoints:** `/health/live` and `/health/ready`.
- **Abuse controls:** security headers, configured CORS, and request rate limiting.

## Planned service boundaries

Keep these as separate modules as the project grows:

1. Identity and account lifecycle.
2. Player profiles and progression.
3. Presence and session directory.
4. Matchmaking and lobby allocation.
5. Real-time game-session transport.
6. Mission/activity orchestration.
7. Telemetry, moderation, and administration.

Do not add game-state synchronization until the client protocol, authority model, and threat model are documented. The server must remain authoritative for currency, inventory, progression, and rewards.

## Request flow

`client -> HTTPS/API gateway -> Fastify route -> validation -> service -> PostgreSQL`

Real-time session traffic should eventually use a separately designed transport and explicit message schemas rather than being mixed into account HTTP routes.

## Local setup

1. Install Node.js 20.11 or newer and PostgreSQL.
2. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` of at least 32 characters.
3. Create a PostgreSQL database matching `DATABASE_URL`.
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

## API endpoints

- `GET /` — service identity.
- `GET /health/live` — process liveness.
- `GET /health/ready` — database readiness.
- `POST /v1/auth/register` — create an account.
- `POST /v1/auth/login` — obtain an access token.
- `GET /v1/auth/me` — inspect the authenticated account.

The initial release intentionally does not implement matchmaking, game networking, Social Club emulation, or GTA gameplay logic. Those require separately specified and tested designs.
