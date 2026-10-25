# Windows community-services adapter

This directory builds a small C++17 static library that makes ordinary HTTP calls to the 1.61ONLINE community API using the Windows WinHTTP API. It is a reference client for a project that is intentionally configured to call this backend.

It is **not** an exported Social Club replacement DLL, a replacement for Rockstar's private ABI, or a complete GTA source patch. The calling application must intentionally integrate these methods at the appropriate application-level service boundary using source and interfaces it is authorized to modify.

## Build

Use Visual Studio 2022 with the Desktop development with C++ workload and CMake:

```powershell
cmake -S integrations/windows -B build/community-services -A x64
cmake --build build/community-services --config Release
```

This creates a static library. Include `community_services_client.hpp` in the calling application and link the resulting library plus `winhttp.lib`. The library requires Windows and C++17.

## Configure and use

Construct `one61::CommunityServicesClient` with the origin of your own deployment, such as `L"https://community.example.com"`. An origin is just scheme and host/port; configure it rather than hard-coding a production URL. HTTPS is recommended for deployments. Plain HTTP is suitable only for local development on a trusted machine.

Call `Bootstrap()` first and check that the JSON response reports contract ID `community-client-services` and version `1`. Then use `Register()` or `Login()`. Securely store the access and refresh tokens, parse the raw JSON response with your application's approved JSON parser, rotate refresh tokens using `Refresh()`, and call `Logout()` when ending the session. Do not log passwords, access tokens, or refresh tokens.

The wrapper also includes account/session revocation, profile/account reads, player search and friend requests, presence heartbeat and directory calls, public session creation/join/leave, and matchmaking queue/status/cancellation. Session creation is limited to 2–32 players client-side and server-side; server validation remains authoritative.

Every method returns `HttpResult`:
- `transportOk` indicates whether the HTTP exchange completed.
- `statusCode` is the HTTP status returned by the server.
- `transportError` is the Win32 error when an exchange fails.
- `body` holds a bounded JSON response body; callers must parse it and handle non-2xx statuses.

## Current limitations

The library is intentionally a thin HTTP adapter. It doesn't alter GTA source on its own, hook proprietary Social Club calls, parse GTA-specific binary messages, or implement the gameplay transport. Integration requires a compatible client adapter, and multiplayer gameplay still needs a separately designed authoritative server and real-time protocol. Cloud saves, entitlement checks, achievements, voice, and fully automatic matchmaking remain unsupported.
