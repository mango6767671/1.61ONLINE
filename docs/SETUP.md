# Backend setup (development)

This guide covers only the community backend and Discord bot. It does not cover modifying or connecting the GTA client.

## Requirements

- Node.js 22 or newer and npm.
- PostgreSQL 16, or Docker Desktop with Docker Compose.
- A Discord application/bot only if you want to run the bot.

## Option A — Start everything with Docker Compose

1. Clone the repository and enter its directory.
2. Copy the environment template:
   - Windows PowerShell: Copy-Item .env.example .env
   - macOS/Linux: cp .env.example .env
3. Open .env. Replace POSTGRES_PASSWORD, JWT_SECRET, and DISCORD_BOT_API_KEY with strong, separate random values. Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID after creating your Discord application. The bot cannot start with the example placeholders.
4. Generate secrets with Node.js if needed:

       node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

   Run this separately for each secret. Keep the real values in your local .env; do not commit it.
5. For quick slash-command testing, set DISCORD_GUILD_ID to your own test server ID. Leave it empty to register globally.
6. Start the stack:

       docker compose up --build -d

7. View service logs:

       docker compose logs -f api bot

8. Check backend readiness in a browser or PowerShell:

       Invoke-RestMethod http://127.0.0.1:3000/health/ready

Compose starts PostgreSQL, applies migrations, starts the API, and starts the bot. The API is bound to host loopback (127.0.0.1:3000) by default, so it is not exposed to the public internet. Postgres data is stored in the online-postgres-data volume.

To stop the services without deleting data, run docker compose down. Avoid docker compose down -v unless you deliberately want to delete the database volume and all local community data.

## Option B — Run the API directly on your computer

1. Install/start PostgreSQL and create a database named online.
2. Copy .env.example to .env.
3. Set DATABASE_URL to your local PostgreSQL connection string. If your password contains URL-reserved characters, URL-encode the password or use a random alphanumeric password.
4. Replace JWT_SECRET with a long random secret. Replace DISCORD_BOT_API_KEY with a different random secret. The bot process and API process must use the same DISCORD_BOT_API_KEY.
5. Install packages:

       npm install

6. Create/update the database schema:

       npm run db:migrate

7. Start the backend:

       npm run dev

8. Check http://127.0.0.1:3000/health/live and http://127.0.0.1:3000/health/ready.

The API should remain running in that terminal. Use a second terminal for the Discord bot.

## Run the Discord bot on the same computer

After configuring the Discord variables in docs/DISCORD_BOT.md:

    npm run bot:deploy
    npm run bot:dev

Run npm run bot:deploy again whenever slash-command definitions change. During development, use a test server ID in DISCORD_GUILD_ID so commands register to that server. For a global deployment, leave the variable empty. Global command changes may take longer to propagate.

## Useful development commands

| Command | Purpose |
|---|---|
| npm run dev | Watch and run the HTTP API |
| npm run db:migrate | Apply pending SQL migrations |
| npm test | Run Vitest tests |
| npm run typecheck | Type-check backend and bot TypeScript |
| npm run build | Compile backend and bot |
| npm run bot:deploy | Register Discord slash commands |
| npm run bot:dev | Watch and run the Discord bot |
| npm run bot:start | Run compiled bot code |

## Troubleshooting

**Health readiness fails.** Check that PostgreSQL is running, DATABASE_URL is correct, and npm run db:migrate completed.

**Bot reports API authentication failed.** DISCORD_BOT_API_KEY in the API and bot process must match exactly, and must be at least 32 characters.

**Bot says the Discord integration is not configured.** The backend process needs DISCORD_BOT_API_KEY set and restarted after changing .env.

**Slash commands do not appear.** Verify DISCORD_CLIENT_ID, the bot token, and that the bot was invited with applications.commands. For development, set DISCORD_GUILD_ID and rerun npm run bot:deploy.

**Tickets fail to create.** The bot needs permission to manage channels, and its highest role must be above any roles it assigns. If a ticket category ID is configured, the category must exist in the same server.

**Verified role assignment fails.** Set DISCORD_VERIFIED_ROLE_ID, grant Manage Roles, and place the bot's highest role above the verified role.

## Production notes

Use HTTPS through a reverse proxy or platform ingress, strong unique secrets, regular PostgreSQL backups, restricted database credentials, and a proper secrets manager. Do not expose DISCORD_BOT_API_KEY in a public client, Discord message, screenshot, log, or source file. The key grants bot-level administrative access to the integration API.
