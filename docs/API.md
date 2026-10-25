# HTTP API

All routes are served over HTTPS in deployed environments. JSON request and response bodies are used unless otherwise stated. Protected routes require:

```
Authorization: Bearer <accessToken>
```

## Service

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Service identity |
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | Database readiness |
| GET | `/v1/client/bootstrap` | Community client contract and capability manifest |

## Authentication

### POST /v1/auth/register

Creates an account and its initial player profile.

```json
{
  "email": "player@example.com",
  "password": "use-a-long-unique-password"
}
```

Passwords must be 12–128 characters. Email addresses are normalized to lowercase. Returns `201` with a user object and a 15-minute bearer access token. Duplicate email returns `409`.

### POST /v1/auth/login

Accepts the same email/password fields. Returns a 15-minute bearer access token. Invalid credentials return the same `401` response regardless of whether the email exists.

### POST /v1/auth/refresh

Accepts `{"refreshToken":"<refreshToken>"}`. A valid refresh token is rotated atomically: the submitted token is revoked and a new access/refresh pair is returned. Refresh tokens expire after 30 days. Reuse of a previously rotated token revokes the account's remaining active refresh sessions.

### POST /v1/auth/logout

Accepts the current refresh token and revokes its session. The response is idempotent and does not disclose whether a token existed. Its bound access token is rejected immediately by authenticated API routes.

### POST /v1/auth/logout-all

Requires a bearer access token and revokes all active refresh sessions for that account. Authenticated requests tied to revoked sessions are rejected immediately.

### GET /v1/auth/me

Returns the authenticated account. Access tokens last 15 minutes. Clients should securely store the refresh token, use the refresh endpoint before access-token expiry, and never log credentials or tokens.

## Client account facade

### GET /v1/client/bootstrap

Public machine-readable contract manifest. It declares the community contract ID/version, routes, heartbeat recommendations, and implemented/unimplemented capabilities. The contract is independent of Rockstar service protocols; a client must be explicitly adapted to consume it.

### GET /v1/client/account

Returns the authenticated account, player profile, and presence snapshot in one response. This endpoint returns only the caller's account details.

## Player profile

### GET /v1/player/profile

Returns the authenticated player's display name, rank, cash, and bank balance. Monetary values are serialized as decimal strings to avoid JavaScript integer precision loss.

### PATCH /v1/player/profile

Updates the display name only.

```json
{
  "displayName": "Player_One"
}
```

The value may be null to clear the name. Non-null names must be 3–32 characters and contain letters, numbers, spaces, underscores, or hyphens.

## Community social graph

Player IDs are community account UUIDs. The social graph is not synced with Rockstar accounts or any external service.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/social/players?query=player` | Search public display names |
| GET | `/v1/social/friends` | List accepted friends and their current presence |
| GET | `/v1/social/friend-requests?direction=incoming` | List incoming or outgoing requests |
| POST | `/v1/social/friend-requests` | Send a request |
| POST | `/v1/social/friend-requests/:userId/accept` | Accept an incoming request |
| DELETE | `/v1/social/friend-requests/:userId` | Cancel or decline a pending request |
| DELETE | `/v1/social/friends/:userId` | Remove a friend |

Send-request body:

```json
{
  "targetUserId": "00000000-0000-4000-8000-000000000000"
}
```

Player search requires a 2–32 character display-name fragment. It excludes the caller and accounts already connected by a pending or accepted relationship. Responses do not expose other players' email addresses. Friend and request lists are bounded.

## Error shape

Errors use a stable machine-readable `error` key. Validation errors may also include a `details` object. Clients should not rely on internal database or exception messages.

## Presence

All presence endpoints require authentication.

| Method | Path | Purpose |
|---|---|---|
| PUT | `/v1/presence/heartbeat` | Refresh the caller's presence lease |
| GET | `/v1/presence` | List recently active players |

Send a heartbeat periodically (the client contract recommends every 30 seconds). Presence older than 90 seconds is excluded from the active-player list. The heartbeat body may contain `{"status":"away"}`; otherwise status defaults to `online`. A player in a session remains marked `in_session`.

## Sessions

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/sessions?region=us-east&gameMode=freemode` | Discover public open sessions |
| POST | `/v1/sessions` | Create a session; creator is its first member |
| POST | `/v1/sessions/:sessionId/join` | Join an open public session |
| POST | `/v1/sessions/:sessionId/leave` | Leave a session |

Session creation body:

```json
{
  "name": "Freemode lobby",
  "region": "us-east",
  "gameMode": "freemode",
  "visibility": "public",
  "maxPlayers": 16
}
```

The server enforces the 2–32 player capacity range and one active session membership per account. Empty sessions are closed when their last member leaves. Private-session invitations and owner controls are not implemented yet.

## Matchmaking queue

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/matchmaking/queue` | Enter or update the caller's queue request |
| GET | `/v1/matchmaking/status` | Read queue state |
| DELETE | `/v1/matchmaking/queue` | Cancel the queue request |

Queue body:

```json
{
  "gameMode": "freemode",
  "region": "us-east"
}
```

This milestone stores queue requests and exposes queue status. It does **not** yet run a matchmaking worker or automatically assign players to sessions.

## Compatibility boundary

This is an independently defined community API, not an implementation of Rockstar's private Social Club wire protocol. The bootstrap response deliberately reports unsupported services such as automatic matchmaking, real-time gameplay transport, cloud saves, achievements, voice chat, and game-entitlement checks. A game client needs an intentional adapter to this contract; the backend alone cannot make an unmodified client use it.

HTTP session endpoints manage lobby control-plane operations only. They do not synchronize player coordinates, physics, vehicles, mission state, or other gameplay events.
