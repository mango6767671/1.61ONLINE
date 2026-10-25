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
