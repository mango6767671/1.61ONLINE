# Backend setup

This guide covers running the community API and PostgreSQL database. It does not cover game-client integration.

## Requirements

- Node.js 22 or newer
- PostgreSQL 16 or newer
- Git
- Optional: Docker Desktop with Docker Compose

## 1. Get the project

```powershell
git clone https://github.com/mango6767671/1.61ONLINE.git
cd 1.61ONLINE
npm install
```

## 2. Create the database

Create a PostgreSQL database named `online`. With psql:

```sql
CREATE DATABASE online;
```

Or use your own database name and update `DATABASE_URL`.

## 3. Configure environment

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:
- `DATABASE_URL` to your PostgreSQL connection string
- `JWT_SECRET` to a unique random value of at least 32 characters
- `HOST=127.0.0.1` for local-only development, or `0.0.0.0` inside a container
- `PORT=3000`

Generate a strong secret in PowerShell:

```powershell
-join ((1..48 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

Do not commit `.env`, publish secrets, or reuse the example JWT secret.

## 4. Run database migrations

```powershell
npm run db:migrate
```

Migrations are versioned SQL files in `migrations/`. Run them before starting the API after pulling changes.

## 5. Start the API

Development with automatic reload:

```powershell
npm run dev
```

Production build and start:

```powershell
npm run build
npm start
```

The API listens at `http://127.0.0.1:3000` by default.

## 6. Verify it

Open these URLs:
- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/health/live`
- `http://127.0.0.1:3000/health/ready`

The readiness endpoint checks PostgreSQL connectivity. If it fails, verify that PostgreSQL is running and `DATABASE_URL` has the correct host, port, database, username, and password.

## 7. Run tests

```powershell
npm run typecheck
npm test
npm run build
```

## Deployment checklist

- Use a managed PostgreSQL instance or a private database network.
- Put the API behind HTTPS/reverse proxy.
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, and the correct `CORS_ORIGIN`.
- Keep PostgreSQL backups and test restores.
- Restrict database access to the API and bot hosts.
- Keep `.env` and Discord credentials out of Git.
- Configure logs, uptime monitoring, and database connection alerts.
- Do not expose PostgreSQL port 5432 publicly.

The API and Discord bot are separate processes and can run on the same machine or separate hosts. Both use the same PostgreSQL database.
