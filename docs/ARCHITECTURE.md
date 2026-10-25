# Architecture

## Project boundary

This repository is an independent community service implementation. It must not contain leaked, decompiled, copied, or otherwise unauthorized Rockstar source code, proprietary server code, credentials, game assets, private service protocols, or signing material. Compatibility work must be based on independently authored code and documented interfaces the project is authorized to use. Do not impersonate Rockstar services or use Rockstar credentials.

## Current foundation

- **HTTP API:** Fastify, versioned under `/v1`.
- **Identity:** email/password accounts; Argon2id password hashes; short-lived signed access tokens.
- **Persistence:** PostgreSQL.
- **Validation:** Zod at request boundaries.
- **Operational endpoints:** `/health/live` and `/health/ready`.
- **Abuse controls:** security headers, configured CORS, and request rate limiting.
- **Client facade:** `GET /v1/client/bootstrap` publishes a versioned community contract and truthful capability manifest; `GET /v1/client/account` returns the caller's account/profile/presence snapshot.
- **Community social graph:** searchable display names, friend requests, accepted friendships, and current-presence hints.

## Service boundaries

1. Identity and account lifecycle.
2. Player profiles and progression.
3. Community client contract and service discovery.
4. Social graph, presence, and session directory.
5. Matchmaking and lobby allocation.
6. Real-time game-session transport.
7. Mission/activity orchestration.
8. Telemetry, moderation, and administration.

The client contract is deliberately not wire-compatible with private Rockstar Social Club APIs. A client adapter must intentionally target the community endpoints using interfaces and source that the project is authorized to modify. The client contract does not change entitlement status or authorize use of proprietary services.

Do not add game-state synchronization until the client protocol, authority model, and threat model are documented. The server must remain authoritative for currency, inventory, progression, and rewards.

## Request flow

`client adapter -> HTTPS/API gateway -> Fastify route -> validation -> service -> PostgreSQL`

Real-time session traffic should eventually use a separately designed transport and explicit message schemas rather than being mixed into account HTTP routes.

## Local setup

1. Install Node.js 22 or newer and PostgreSQL.
2. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` of at least 32 characters.
3. Create a PostgreSQL database matching `DATABASE_URL`.
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

## API endpoints

- `GET /` — service identity.
- `GET /health/live` — process liveness.
- `GET /health/ready` — database readiness.
- `POST /v1/auth/register` — create a community account.
- `POST /v1/auth/login` — obtain a community access token.
- `GET /v1/auth/me` — inspect the authenticated account.
- `GET /v1/client/bootstrap` — retrieve the versioned client contract.
- `GET /v1/client/account` — retrieve the caller's account/profile/presence.
- `/v1/social/*` — community player search and friendship management.

## Important limitations

This is a backend foundation, not a drop-in Social Club binary or a complete GTA client implementation. A compatible client adapter, automatic matchmaking worker, session expiry/reconnection management, real-time gameplay transport, and authoritative gameplay server remain separate engineering work. Compatibility with any unmodified GTA client is not claimed.
