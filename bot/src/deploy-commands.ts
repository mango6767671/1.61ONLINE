import { REST, Routes } from "discord.js";
import { botConfig } from "./config.js";
import { commands } from "./commands.js";

const rest = new REST({ version: "10" }).setToken(botConfig.token);
const route = botConfig.guildId
  ? Routes.applicationGuildCommands(botConfig.clientId, botConfig.guildId)
  : Routes.applicationCommands(botConfig.clientId);

try {
  const result = await rest.put(route, { body: commands.map((command) => command.toJSON()) });
  const scope = botConfig.guildId ? `guild ${botConfig.guildId}` : "global";
  const count = Array.isArray(result) ? result.length : commands.length;
  console.log(`Registered ${count} slash commands for ${scope}.`);
} catch (error) {
  console.error("Slash-command registration failed. Check bot token, client ID, and scopes.");
  console.error(error);
  process.exitCode = 1;
}
