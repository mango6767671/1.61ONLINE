# 1.61ONLINE Discord bot

The bot is an independent community-management bot backed by the 1.61ONLINE API. It is not connected to the game client and does not require any GTA source changes.

## Features

### Member commands

- /signup — create or refresh a Discord-linked community account. It does not ask for a password in Discord.
- /verify — assign the configured verified role to a registered member.
- /profile — view a Discord-linked community profile.
- /status — API/database health, account count, active presence, lobby records, matchmaking queue, reports, and tickets.
- /players — search registered Discord-linked players.
- /sessions — list public backend lobby records. These are not proof that gameplay servers are running.
- /announcements — read active community announcements.
- /report — file a private report for cheating, harassment, exploits, bugs, or other issues.
- /suggest — submit a feature suggestion.
- /ticket create and /ticket close — create and close private support channels.
- /rules, /faq, /help, /ping.

### Staff commands

All /admin subcommands require Discord Administrator permission or a role configured in DISCORD_ADMIN_ROLE_IDS.

- /admin stats — backend counts and maintenance status.
- /admin player — inspect a registered player.
- /admin ban and /admin unban — ban/unban a community account. Banning revokes its access sessions and the backend rejects authenticated requests while the ban is active. This does not ban the user from Discord.
- /admin reports and /admin resolve-report — review reports and record a staff decision.
- /admin announce and /admin remove-announcement — publish or deactivate announcements.
- /admin maintenance — enable/disable API maintenance mode. While enabled, normal /v1 routes return HTTP 503; health checks and the private bot integration remain available so staff can disable it.
- /admin audit — inspect recent staff audit events.
- /admin tickets and /admin close-ticket — list/close tickets.
- /admin suggestions and /admin update-suggestion — review and update feature ideas.
- /admin role — add/remove a Discord role, subject to the bot's role hierarchy.
- /admin config — inspect which optional role/channel settings are configured.

Staff actions that change backend data are persisted and written to the community audit log. Some Discord-only changes (for example, role assignments) are also audited through the API.

## 1. Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application named something like **1.61ONLINE Community**.
3. On General Information, copy the Application ID into DISCORD_CLIENT_ID.
4. Open the Bot page and create/reset the bot token. Copy it into DISCORD_BOT_TOKEN. Treat this token like a password.
5. Under OAuth2/Installation settings, ensure your invite includes the bot and applications.commands scopes.
6. Invite the bot to your community server using the generated install link.

The bot uses slash commands and does not need the Message Content privileged intent. Its Gateway intent list is limited to guilds.

## 2. Give the bot the required permissions

At minimum, grant it access to see relevant channels, send messages, embed links, and read message history. The optional features need:

- **Manage Channels** — create private support ticket channels and close/rename them.
- **Manage Roles** — assign the configured verified role and perform the guarded /admin role operation.
- Its top role must be above any role it needs to assign.

Use the minimum permissions needed for your server, and do not place the bot's role above your own administrator role. The bot's own code also checks configured admin role IDs before running /admin commands.

## 3. Configure .env

Copy .env.example to .env and set these values:

| Variable | Meaning |
|---|---|
| DISCORD_BOT_TOKEN | Secret token from the Discord Developer Portal |
| DISCORD_CLIENT_ID | Discord Application ID |
| DISCORD_GUILD_ID | Your development/test server ID; leave blank for global commands |
| COMMUNITY_API_BASE_URL | API origin when running locally, usually http://127.0.0.1:3000 |
| DISCORD_BOT_API_KEY | Separate random secret of at least 32 characters; must match the API's value |
| DISCORD_ADMIN_ROLE_IDS | Comma-separated Discord role IDs allowed to use staff commands |
| DISCORD_MOD_ROLE_IDS | Comma-separated moderator role IDs; these can access ticket channels/close tickets |
| DISCORD_VERIFIED_ROLE_ID | Optional role assigned after signup or /verify |
| DISCORD_LOG_CHANNEL_ID | Optional channel for moderation, ticket, and signup log embeds |
| DISCORD_ANNOUNCEMENT_CHANNEL_ID | Optional channel that receives newly published announcements |
| DISCORD_TICKET_CATEGORY_ID | Optional category under which private tickets are created |

Enable Developer Mode in Discord to copy server, role, and channel IDs. Store the actual bot token and API key only in local environment/secrets. Never commit your real .env.

## 4. Register and run slash commands

For local development, set DISCORD_GUILD_ID to your test server. Then run:

    npm install
    npm run bot:deploy
    npm run bot:dev

The deploy script registers the commands to that single guild, which is convenient during development. Once you're ready for public use, blank DISCORD_GUILD_ID, run npm run bot:deploy again to register global commands, then run npm run bot:start after compiling. Discord documents application/slash commands at [Application Commands](https://discord.com/developers/docs/interactions/slash-commands); the discord.js guide also explains [command deployment](https://discordjs.guide/legacy/app-creation/deploying-commands).

The backend/API must be running and the API's DISCORD_BOT_API_KEY must equal the key available to the bot process.

## 5. Configure roles and channels safely

- Leave DISCORD_ADMIN_ROLE_IDS blank to allow staff commands only to members with the Discord Administrator permission.
- Add role IDs to DISCORD_ADMIN_ROLE_IDS when you want a dedicated revival staff role to administer community accounts and moderation.
- Add role IDs to DISCORD_MOD_ROLE_IDS for ticket access and ticket closing.
- Set DISCORD_LOG_CHANNEL_ID to a private staff log channel. Report details are intentionally not copied into the log embed; staff can inspect the full report with /admin reports.
- Set DISCORD_ANNOUNCEMENT_CHANNEL_ID to a channel intended for public announcements.
- Set DISCORD_TICKET_CATEGORY_ID to a category where the bot can create private channels.

The bot does not silently promote people or automatically grant admin rights. Test the configuration with a small staff group first.

## Account behavior and limitations

Discord signup creates a community account linked to the Discord user ID, and currently has no email/password credentials. Existing email/password accounts are not automatically linked to Discord; an explicit secure account-link flow is still future work. The bot never asks members to send passwords in slash-command options.

The player rank/cash/bank values are community database fields, not official Rockstar account values. The bot's session and matchmaking views show the current backend's lobby records and queue requests. They do not mean real gameplay networking, automatic matchmaking, or GTA client integration is complete.
