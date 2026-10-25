import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { botConfig } from "./config.js";
import { friendlyError, handleCommand } from "./commands.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, (readyClient) => {
  console.info("1.61ONLINE Discord bot connected as " + readyClient.user.tag + ".");
  console.info("Guild command mode: " + (botConfig.guildId ? "development guild" : "global"));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(client, interaction);
  } catch (error) {
    console.error("Command /" + interaction.commandName + " failed:", error instanceof Error ? error.message : "Unknown error");
    const message = friendlyError(error);
    try {
      if (interaction.deferred) await interaction.editReply({ content: message });
      else if (interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    } catch {
      // The interaction may have expired or Discord may be unavailable.
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error.message);
});

const shutdown = async (signal: string) => {
  console.info("Received " + signal + "; shutting down Discord bot.");
  client.destroy();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

client.login(botConfig.token).catch((error: unknown) => {
  console.error("Discord login failed. Check DISCORD_BOT_TOKEN and application configuration.");
  console.error(error instanceof Error ? error.message : "Unknown Discord login error");
  process.exitCode = 1;
});
