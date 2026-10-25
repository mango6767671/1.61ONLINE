# Contributing

## Ground rules

- Submit independently written code only.
- Do not contribute leaked, decompiled, copied, or unauthorized proprietary code, game assets, credentials, or private server data.
- Keep pull requests focused and explain the behavior, security impact, and test coverage.
- Never commit secrets or real player data.

## Development

Use Node.js 20.11+ and PostgreSQL. Follow the local setup in `docs/ARCHITECTURE.md`.

Before opening a pull request, run:

```sh
npm run typecheck
npm test
npm run build
```

## Design expectations

Prefer small modules, explicit request/response schemas, parameterized database access, and server-authoritative state changes. Document new API routes and database migrations. Changes to account security or player progression require tests.
