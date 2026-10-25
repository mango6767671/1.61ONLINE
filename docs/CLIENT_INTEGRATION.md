# Community client integration contract

## What this is

The community backend now exposes an independently defined client-services contract at `GET /v1/client/bootstrap`. It tells a client adapter which community endpoints exist and which capabilities are not implemented. The contract is designed for a client that is deliberately configured to use 1.61ONLINE.

This is **not** a wire-compatible Social Club implementation, an official Rockstar service, or a patch for an unmodified GTA V client. A real client adapter must be implemented and built against a source tree and interfaces that the project is authorized to modify. Do not copy proprietary service code, credentials, protocol definitions, or private signing material.

## Windows reference adapter

The repository includes a small WinHTTP wrapper in `integrations/windows/community_services_client.hpp` and `.cpp`. It provides typed method names for the community endpoints but deliberately returns the HTTP response body as raw JSON; the calling client should parse it with its approved JSON library and check both `transportOk` and `statusCode`. Link against `winhttp.lib`. The adapter is a starting point for application-level calls, not a binary-compatible replacement for the Social Club SDK or its internal interfaces.

The adapter uses HTTPS when the configured base URL is HTTPS. Use plain HTTP only on a trusted local development machine. Never print access tokens or passwords in logs.

## Suggested client flow

1. Configure a community API base URL, for example `https://online.example.invalid`. Do not hard-code a production domain into the client.
2. Fetch `GET /v1/client/bootstrap` and verify the expected community contract ID and version.
3. Register or authenticate using `POST /v1/auth/register` or `POST /v1/auth/login`. Keep the returned bearer token in the platform's appropriate secure storage and never log it.
4. Send `Authorization: Bearer <accessToken>` on protected requests.
5. Fetch `GET /v1/client/account` and `GET /v1/player/profile` to populate community identity and profile state.
6. Use `/v1/social/players`, `/v1/social/friends`, and `/v1/social/friend-requests` for the community friend graph.
7. Refresh online presence with `PUT /v1/presence/heartbeat` approximately every 30 seconds. A presence entry is treated as active for 90 seconds.
8. Use `/v1/sessions` and `/v1/matchmaking/*` for lobby control-plane operations.

## Contract behavior

- Authentication is the project's own email/password account system with a short-lived bearer access token.
- Player IDs are community account UUIDs, not Rockstar account identifiers.
- The friend graph is private to 1.61ONLINE and does not synchronize to Rockstar services.
- Money, rank, and other progression shown by the current profile API are community database fields. They are not authoritative GTA Online data.
- The bootstrap manifest reports unsupported features explicitly. At this point automatic matchmaking, real-time gameplay transport, authoritative gameplay, cloud saves, achievements, voice chat, and game-entitlement checks are not implemented.
- HTTP session endpoints manage lobbies only; they do not synchronize game world state.

## What is still required for an actual game integration

The project needs a compatible client-side adapter that calls this contract, a separately designed and secured gameplay transport, an authoritative game-session server, and integration tests from the target client. The actual adapter must be based on documented interfaces and lawful source access; a server API alone cannot make a client that is hard-wired to a different service protocol connect to this backend.
