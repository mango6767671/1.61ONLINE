# Development roadmap

This roadmap describes intended work, not implemented features.

## Phase 0 — Foundation

- [x] TypeScript/Fastify service scaffold
- [x] PostgreSQL connection pool and initial schema
- [x] Account registration and login with Argon2id
- [x] Short-lived signed access tokens
- [x] Authenticated account and player-profile endpoints
- [x] Liveness/readiness endpoints
- [x] Basic CI, container setup, and security guidance

## Phase 1 — Account and player data

- [ ] Refresh-token rotation and session revocation
- [ ] Email verification and account recovery design
- [ ] Player profile persistence tests
- [ ] Server-authoritative inventory and progression models
- [ ] Audit log for sensitive account/economy mutations

## Phase 2 — Presence and sessions

- [ ] Presence service with explicit online/offline lifecycle
- [ ] Session directory and heartbeat/expiry rules
- [ ] Lobby model and matchmaking queue design
- [ ] Abuse controls and load tests

## Phase 3 — Real-time gameplay services

- [ ] Documented client/server message schemas
- [ ] Server-authoritative session state
- [ ] Reconnection and timeout behavior
- [ ] Mission/activity lifecycle
- [ ] Observability and moderation controls

Do not mark a phase complete until its implementation, tests, documentation, and security review are present. Compatibility with any particular game client is not claimed by this backend foundation.
