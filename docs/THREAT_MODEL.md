# Initial threat model

## Assets to protect

- Account credentials and access tokens
- Player identity and profile data
- Currency, progression, inventory, and rewards
- Database availability and integrity
- Administrative capabilities and audit records

## Trust boundaries

Clients are untrusted. A client may modify requests, replay messages, automate traffic, or claim arbitrary player state. Only validated server-side operations may change persistent game state. Database credentials and signing secrets remain server-side.

## Initial threats and controls

| Threat | Initial control | Remaining work |
|---|---|---|
| Password database disclosure | Argon2id password hashes | Tune parameters and add credential-stuffing defenses |
| SQL injection | Parameterized SQL | Review every new query |
| Token theft/replay | Short access-token lifetime, HTTPS requirement | Refresh-token rotation, revocation, device/session controls |
| Account enumeration | Generic login failure | Review registration and recovery flows |
| Request flooding | Global rate limit | Per-route and per-account limits; distributed limiter |
| Client-side currency tampering | No economy mutation endpoint exists yet | Server-authoritative transaction ledger before economy features |
| Secret leakage | Environment-based configuration and gitignore | Secret scanning and deployment secret manager |
| Unauthorized infrastructure testing | Contributor policy | Operational access controls and monitoring |

## Security invariants

1. Never trust client-submitted cash, bank, rank, inventory, or reward amounts.
2. Never expose password hashes, signing secrets, or raw bearer tokens in logs or responses.
3. Use parameterized database queries and validate every external payload.
4. Require authorization checks on every player-owned resource.
5. Keep privileged administration separate from ordinary player routes.
6. Only test systems for which the project has explicit authorization.

This is an initial checklist, not a completed security audit.
