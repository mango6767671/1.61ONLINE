import "dotenv/config";
import { z } from "zod";

const optionalSnowflake = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.string().regex(/^\d{17,20}$/).optional()
);

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_GUILD_ID: optionalSnowflake,
  COMMUNITY_API_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  DISCORD_BOT_API_KEY: z.string().min(32),
  DISCORD_ADMIN_ROLE_IDS: z.string().default(""),
  DISCORD_MOD_ROLE_IDS: z.string().default(""),
  DISCORD_VERIFIED_ROLE_ID: optionalSnowflake,
  DISCORD_LOG_CHANNEL_ID: optionalSnowflake,
  DISCORD_ANNOUNCEMENT_CHANNEL_ID: optionalSnowflake,
  DISCORD_TICKET_CATEGORY_ID: optionalSnowflake
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid Discord bot configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid Discord bot configuration. Check .env and docs/DISCORD_BOT.md.");
}

const roleIds = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export const botConfig = {
  token: parsed.data.DISCORD_BOT_TOKEN,
  clientId: parsed.data.DISCORD_CLIENT_ID,
  guildId: parsed.data.DISCORD_GUILD_ID,
  apiBaseUrl: parsed.data.COMMUNITY_API_BASE_URL.replace(/\/$/, ""),
  apiKey: parsed.data.DISCORD_BOT_API_KEY,
  adminRoleIds: roleIds(parsed.data.DISCORD_ADMIN_ROLE_IDS),
  moderatorRoleIds: roleIds(parsed.data.DISCORD_MOD_ROLE_IDS),
  verifiedRoleId: parsed.data.DISCORD_VERIFIED_ROLE_ID,
  logChannelId: parsed.data.DISCORD_LOG_CHANNEL_ID,
  announcementChannelId: parsed.data.DISCORD_ANNOUNCEMENT_CHANNEL_ID,
  ticketCategoryId: parsed.data.DISCORD_TICKET_CATEGORY_ID
};
