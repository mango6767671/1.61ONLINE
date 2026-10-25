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

### GET /v1/auth/me

Returns the authenticated account.

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

## Error shape

Errors use a stable machine-readable `error` key. Validation errors may also include a `details` object. Clients should not rely on internal database or exception messages.


## Presence

All presence endpoints require authentication.

| Method | Path | Purpose |
|---|---|---|
| PUT | `/v1/presence/heartbeat` | Refresh the caller's presence lease |
| GET | `/v1/presence` | List recently active players |

Send a heartbeat periodically (for example, every 30 seconds). Presence older than 90 seconds is excluded from the active-player list. The heartbeat body may contain `{"status":"away"}`; otherwise status defaults to `online`. A player in a session remains marked `in_session`.

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

## Presence and session lifecycle notes

These are HTTP control-plane endpoints, not a real-time game transport. They do not synchronize player coordinates, physics, vehicles, mission state, or other gameplay events. Those require a separately designed authoritative real-time service and a compatible client.
