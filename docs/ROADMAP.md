# Development roadmap

This roadmap describes current implementation state and planned work.

## Phase 0 — Foundation

- [x] TypeScript/Fastify service scaffold
- [x] PostgreSQL connection pool and initial schema
- [x] Account registration and login with Argon2id
- [x] Short-lived signed access tokens
- [x] Authenticated account and player-profile endpoints
- [x] Liveness/readiness endpoints
- [x] Basic CI, container setup, and security guidance

## Phase 1 — Account and community client contract

- [x] Versioned client bootstrap manifest with capability declarations
- [x] Unified authenticated account/profile/presence snapshot
- [x] Community player search and friend-request/friendship API
- [ ] Refresh-token rotation and session revocation
- [ ] Email verification and account recovery design
- [ ] Player profile persistence and social graph integration tests
- [ ] Server-authoritative inventory and progression models
- [ ] Audit log for sensitive account/economy mutations

## Phase 2 — Presence and sessions

- [x] Basic HTTP presence heartbeat and active-player listing
- [ ] Presence service with robust online/offline lifecycle and lease cleanup
- [x] Session creation, discovery, join, leave, and capacity checks
- [ ] Session directory with expiry cleanup and owner controls
- [x] Persistent lobby/session model and matchmaking queue API
- [ ] Matchmaking worker that groups players and assigns sessions
- [ ] Abuse controls and load tests

## Phase 3 — Client and real-time gameplay integration

- [x] Documented community HTTP contract and current limitations
- [ ] Implement and test the authorized client-side adapter
- [ ] Documented client/server message schemas and real-time transport
- [ ] Server-authoritative session state
- [ ] Reconnection and timeout behavior
- [ ] Mission/activity lifecycle
- [ ] Observability and moderation controls
- [ ] Client-driven end-to-end integration tests

The contract is independently authored and is not wire-compatible with Rockstar's proprietary Social Club APIs. Do not claim compatibility with a target game client until its adapter and end-to-end tests are implemented using interfaces and source the project is authorized to modify.
