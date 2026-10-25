import {
  ChannelType,
  Colors,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Role
} from "discord.js";
import { botConfig } from "./config.js";
import { CommunityApiError, communityApi } from "./api.js";

const simple = (name: string, description: string) => new SlashCommandBuilder().setName(name).setDescription(description);
const mod = simple("mod", "Discord server moderation tools")
  .addSubcommand(s => s.setName("timeout").setDescription("Timeout a member").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addIntegerOption(o => o.setName("minutes").setDescription("Duration, up to 28 days").setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)))
  .addSubcommand(s => s.setName("kick").setDescription("Kick a member from Discord").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)))
  .addSubcommand(s => s.setName("ban").setDescription("Ban a member from Discord").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)))
  .addSubcommand(s => s.setName("unban").setDescription("Unban a Discord account by ID").addStringOption(o => o.setName("user_id").setDescription("17–20 digit Discord ID").setMinLength(17).setMaxLength(20).setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)))
  .addSubcommand(s => s.setName("warn").setDescription("Issue a persistent community warning").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)))
  .addSubcommand(s => s.setName("warnings").setDescription("Review a member's warning history").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
  .addSubcommand(s => s.setName("clear-warnings").setDescription("Clear active warnings").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
  .addSubcommand(s => s.setName("purge").setDescription("Delete recent messages here").addIntegerOption(o => o.setName("amount").setDescription("Number of messages, 2–100").setMinValue(2).setMaxValue(100).setRequired(true)))
  .addSubcommand(s => s.setName("lock").setDescription("Prevent @everyone from sending messages here"))
  .addSubcommand(s => s.setName("unlock").setDescription("Restore inherited @everyone send permissions here"));

const admin = simple("admin", "Community staff tools")
  .addSubcommand(s => s.setName("stats").setDescription("Backend and community statistics"))
  .addSubcommand(s => s.setName("player").setDescription("Inspect a Discord-linked player").addUserOption(o => o.setName("user").setDescription("Player").setRequired(true)))
  .addSubcommand(s => s.setName("ban").setDescription("Ban a community account").addUserOption(o => o.setName("user").setDescription("Player to ban").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)).addIntegerOption(o => o.setName("duration_minutes").setDescription("Omit for permanent").setMinValue(1).setMaxValue(525600)))
  .addSubcommand(s => s.setName("unban").setDescription("Revoke a community ban").addUserOption(o => o.setName("user").setDescription("Player to unban").setRequired(true)))
  .addSubcommand(s => s.setName("reports").setDescription("List community reports").addStringOption(o => o.setName("status").setDescription("Filter").addChoices({name:"Open",value:"open"},{name:"Resolved",value:"resolved"},{name:"Dismissed",value:"dismissed"},{name:"All",value:"all"})))
  .addSubcommand(s => s.setName("resolve-report").setDescription("Resolve or dismiss report").addStringOption(o => o.setName("report_id").setDescription("Report UUID").setRequired(true)).addStringOption(o => o.setName("outcome").setDescription("Decision").addChoices({name:"Resolved",value:"resolved"},{name:"Dismissed",value:"dismissed"}).setRequired(true)).addStringOption(o => o.setName("resolution").setDescription("Staff notes").setMaxLength(1000).setRequired(true)))
  .addSubcommand(s => s.setName("announce").setDescription("Publish a community announcement").addStringOption(o => o.setName("title").setDescription("Title").setMaxLength(100).setRequired(true)).addStringOption(o => o.setName("body").setDescription("Message").setMaxLength(2000).setRequired(true)).addStringOption(o => o.setName("severity").setDescription("Style").addChoices({name:"Info",value:"info"},{name:"Success",value:"success"},{name:"Warning",value:"warning"},{name:"Maintenance",value:"maintenance"}).setRequired(true)).addIntegerOption(o => o.setName("duration_hours").setDescription("Auto-expire after hours").setMinValue(1).setMaxValue(720)))
  .addSubcommand(s => s.setName("remove-announcement").setDescription("Deactivate an announcement").addStringOption(o => o.setName("announcement_id").setDescription("Announcement UUID").setRequired(true)))
  .addSubcommand(s => s.setName("maintenance").setDescription("Enable or disable API maintenance mode").addBooleanOption(o => o.setName("enabled").setDescription("Maintenance state").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("User-facing reason").setMaxLength(500)))
  .addSubcommand(s => s.setName("audit").setDescription("View recent staff audit events").addIntegerOption(o => o.setName("limit").setDescription("Number of entries").setMinValue(1).setMaxValue(50)))
  .addSubcommand(s => s.setName("tickets").setDescription("List open support tickets"))
  .addSubcommand(s => s.setName("close-ticket").setDescription("Close a ticket by UUID").addStringOption(o => o.setName("ticket_id").setDescription("Ticket UUID").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Closing note").setMaxLength(500)))
  .addSubcommand(s => s.setName("suggestions").setDescription("List community suggestions").addStringOption(o => o.setName("status").setDescription("Filter").addChoices({name:"Pending",value:"pending"},{name:"Planned",value:"planned"},{name:"Implemented",value:"implemented"},{name:"Declined",value:"declined"},{name:"All",value:"all"})))
  .addSubcommand(s => s.setName("update-suggestion").setDescription("Update a suggestion").addStringOption(o => o.setName("suggestion_id").setDescription("Suggestion UUID").setRequired(true)).addStringOption(o => o.setName("status").setDescription("New status").addChoices({name:"Planned",value:"planned"},{name:"Implemented",value:"implemented"},{name:"Declined",value:"declined"}).setRequired(true)).addStringOption(o => o.setName("staff_note").setDescription("Internal note").setMaxLength(1000)))
  .addSubcommand(s => s.setName("role").setDescription("Add/remove a Discord role").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)).addStringOption(o => o.setName("action").setDescription("Operation").addChoices({name:"Add",value:"add"},{name:"Remove",value:"remove"}).setRequired(true)))
  .addSubcommand(s => s.setName("config").setDescription("Show bot configuration"));

export const commands = [
  simple("ping", "Check bot responsiveness"),
  simple("help", "Show all community bot features"),
  simple("signup", "Create a Discord-linked 1.61ONLINE community account"),
  simple("verify", "Assign the verified role to a registered player"),
  simple("profile", "View a community player profile").addUserOption(o => o.setName("user").setDescription("Player to look up")),
  simple("status", "Show backend status and community counts"),
  simple("players", "Search Discord-linked community players").addStringOption(o => o.setName("query").setDescription("Optional display-name search").setMinLength(2).setMaxLength(32)),
  simple("sessions", "List open public lobby records"),
  simple("announcements", "View active community announcements"),
  simple("report", "Submit a private report").addUserOption(o => o.setName("target").setDescription("Player being reported")).addStringOption(o => o.setName("category").setDescription("Report category").addChoices({name:"Cheating",value:"cheating"},{name:"Harassment",value:"harassment"},{name:"Exploit",value:"exploit"},{name:"Bug",value:"bug"},{name:"Other",value:"other"}).setRequired(true)).addStringOption(o => o.setName("details").setDescription("What happened?").setMaxLength(1500).setRequired(true)),
  simple("suggest", "Submit an idea for the revival").addStringOption(o => o.setName("idea").setDescription("Your idea").setMinLength(8).setMaxLength(1500).setRequired(true)),
  simple("rules", "Show community rules"),
  simple("faq", "Frequently asked questions"),
  new SlashCommandBuilder().setName("ticket").setDescription("Private support tickets")
    .addSubcommand(s => s.setName("create").setDescription("Open a private support channel").addStringOption(o => o.setName("topic").setDescription("What do you need help with?").setMinLength(3).setMaxLength(120).setRequired(true)))
    .addSubcommand(s => s.setName("close").setDescription("Close the ticket in this channel").addStringOption(o => o.setName("reason").setDescription("Optional closing note").setMaxLength(500))),
  admin,
  mod
];

function actor(i: ChatInputCommandInteraction) {
  return { actorDiscordId: i.user.id, actorUsername: i.user.username };
}

function text(value: unknown, max = 180): string {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : String(value ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : (s || "—");
}

function severityColor(severity: string): number {
  if (severity === "success" || severity === "implemented") return Colors.Green;
  if (severity === "warning" || severity === "maintenance") return Colors.Orange;
  if (severity === "declined" || severity === "dismissed") return Colors.Red;
  return Colors.Blurple;
}

function announcementEmbed(a: Record<string, any>): EmbedBuilder {
  return new EmbedBuilder().setTitle(text(a.title, 100)).setDescription(text(a.body, 3000))
    .setColor(severityColor(String(a.severity ?? "info"))).setFooter({text:"1.61ONLINE community"})
    .setTimestamp(a.createdAt ? new Date(a.createdAt) : new Date());
}

async function hasAdmin(i: ChatInputCommandInteraction): Promise<boolean> {
  if (!i.inGuild() || !i.guild) return false;
  const m = await i.guild.members.fetch(i.user.id);
  return m.permissions.has(PermissionFlagsBits.Administrator) || botConfig.adminRoleIds.some(id => m.roles.cache.has(id));
}

async function hasModerator(i: ChatInputCommandInteraction): Promise<boolean> {
  if (!i.inGuild() || !i.guild) return false;
  const m = await i.guild.members.fetch(i.user.id);
  return m.permissions.has(PermissionFlagsBits.Administrator) ||
    botConfig.adminRoleIds.some(id => m.roles.cache.has(id)) ||
    botConfig.moderatorRoleIds.some(id => m.roles.cache.has(id));
}

async function requireModerator(i: ChatInputCommandInteraction): Promise<boolean> {
  if (await hasModerator(i)) return true;
  await i.reply({content:"A configured community moderator/admin role is required for this command.", flags:MessageFlags.Ephemeral});
  return false;
}

async function requireAdmin(i: ChatInputCommandInteraction): Promise<boolean> {
  if (await hasAdmin(i)) return true;
  await i.reply({content:"Administrator permission or a configured community admin role is required.", flags:MessageFlags.Ephemeral});
  return false;
}

async function logToChannel(client: Client, embed: EmbedBuilder): Promise<void> {
  if (!botConfig.logChannelId) return;
  try {
    const ch = await client.channels.fetch(botConfig.logChannelId);
    if (ch?.isTextBased() && "send" in ch) await (ch as any).send({embeds:[embed]});
  } catch { console.warn("Could not send to the configured Discord log channel."); }
}

async function assignVerified(guild: NonNullable<ChatInputCommandInteraction["guild"]>, userId: string): Promise<void> {
  if (!botConfig.verifiedRoleId) throw new Error("verified_role_not_configured");
  const role = await guild.roles.fetch(botConfig.verifiedRoleId);
  if (!role) throw new Error("verified_role_not_found");
  const member = await guild.members.fetch(userId);
  if (!member.roles.cache.has(role.id)) await member.roles.add(role, "Registered with 1.61ONLINE community");
}

async function openTicket(i: ChatInputCommandInteraction, client: Client): Promise<void> {
  if (!i.guild) { await i.editReply("Tickets can only be created in the community server."); return; }
  const topic = i.options.getString("topic", true);
  let result: Record<string, any>;
  try {
    result = await communityApi.createTicket({openerDiscordId:i.user.id, openerUsername:i.user.username, topic});
  } catch (e) {
    if (e instanceof CommunityApiError && e.status === 409 && e.payload.ticket) {
      const existing = e.payload.ticket as Record<string, any>;
      await i.editReply(existing.channelId ? "You already have an open ticket: <#" + existing.channelId + ">." : "You already have an open ticket being set up. Contact a moderator if this remains stuck.");
      return;
    }
    throw e;
  }
  const ticket = result.ticket as Record<string, any>;
  const overwrites: any[] = [
    {id:i.guild.id, deny:[PermissionFlagsBits.ViewChannel]},
    {id:i.user.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}
  ];
  for (const id of Array.from(new Set(botConfig.adminRoleIds.concat(botConfig.moderatorRoleIds)))) {
    if (i.guild.roles.cache.has(id)) overwrites.push({id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  }
  let channel: any;
  try {
    const safe = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,32) || i.user.id.slice(-6);
    channel = await i.guild.channels.create({
      name:"ticket-" + safe, type:ChannelType.GuildText,
      ...(botConfig.ticketCategoryId ? {parent:botConfig.ticketCategoryId} : {}),
      topic:"1.61ONLINE ticket " + ticket.id + " • opener " + i.user.id,
      permissionOverwrites:overwrites
    });
    await communityApi.linkTicketChannel(String(ticket.id), channel.id);
    await channel.send({content:"<@" + i.user.id + "> Your support ticket is open. Please explain the issue and never post passwords, API keys, or refresh tokens.", embeds:[new EmbedBuilder().setTitle("Support ticket").setDescription(topic).setColor(Colors.Blurple).addFields({name:"Ticket ID",value:String(ticket.id)})]});
  } catch (e) {
    await communityApi.closeTicket(String(ticket.id), {...actor(i),reason:"Ticket channel setup failed"}).catch(()=>undefined);
    if (channel) await channel.delete("Ticket setup failed").catch(()=>undefined);
    throw e;
  }
  await logToChannel(client,new EmbedBuilder().setTitle("Support ticket opened").setColor(Colors.Blurple).addFields({name:"User",value:"<@" + i.user.id + ">"},{name:"Ticket",value:String(ticket.id)},{name:"Channel",value:"<#" + channel.id + ">"}).setTimestamp());
  await i.editReply("Your private support channel is ready: <#" + channel.id + ">.");
}

async function closeTicketById(ticketId: string, i: ChatInputCommandInteraction, client: Client, reason?: string): Promise<void> {
  const all = await communityApi.tickets();
  const ticket = ((all.tickets ?? []) as Record<string, any>[]).find(t=>t.id===ticketId);
  if (!ticket) throw new Error("Open ticket not found. Check the ticket UUID and current status.");
  await communityApi.closeTicket(ticketId,{...actor(i),reason:reason || "Closed by staff"});
  if (i.guild && ticket.channelId) {
    const ch = await i.guild.channels.fetch(String(ticket.channelId)).catch(()=>null);
    if (ch && "permissionOverwrites" in ch) {
      await (ch as any).permissionOverwrites.edit(String(ticket.openerDiscordId),{SendMessages:false}).catch(()=>undefined);
      await (ch as any).setName(("closed-" + (ch as any).name).slice(0,90)).catch(()=>undefined);
      await (ch as any).send({content:"Ticket closed by <@" + i.user.id + ">." + (reason ? " Reason: " + reason : "")}).catch(()=>undefined);
    }
  }
  await communityApi.recordAudit({...actor(i),action:"discord.ticket.close",targetDiscordId:String(ticket.openerDiscordId),details:{ticketId,reason:reason || null}});
  await logToChannel(client,new EmbedBuilder().setTitle("Support ticket closed").setColor(Colors.DarkGrey).addFields({name:"Ticket",value:ticketId},{name:"Staff",value:"<@" + i.user.id + ">"}).setTimestamp());
}

async function closeTicketHere(i: ChatInputCommandInteraction, client: Client, reason?: string): Promise<void> {
  if (!i.guild || !i.channel) { await i.editReply("Use this inside a support ticket channel."); return; }
  const found = await communityApi.ticketByChannel(i.channelId);
  const ticket = found.ticket as Record<string, any>;
  if (String(ticket.openerDiscordId) !== i.user.id && !(await hasModerator(i))) {
    await i.editReply("Only the ticket creator or a moderator can close this ticket."); return;
  }
  await communityApi.closeTicket(String(ticket.id),{...actor(i),reason:reason || "Closed by requester or staff"});
  await (i.channel as any).permissionOverwrites.edit(String(ticket.openerDiscordId),{SendMessages:false}).catch(()=>undefined);
  await (i.channel as any).setName(("closed-" + (i.channel as any).name).slice(0,90)).catch(()=>undefined);
  await (i.channel as any).send({content:"Ticket closed by <@" + i.user.id + ">." + (reason ? " Reason: " + reason : "")}).catch(()=>undefined);
  await logToChannel(client,new EmbedBuilder().setTitle("Support ticket closed").setColor(Colors.DarkGrey).addFields({name:"Ticket",value:String(ticket.id)},{name:"Closed by",value:"<@" + i.user.id + ">"}).setTimestamp());
  await i.editReply("Ticket closed.");
}

async function handleAdmin(i: ChatInputCommandInteraction, client: Client): Promise<void> {
  if (!(await requireAdmin(i))) return;
  const sub = i.options.getSubcommand();
  const a = actor(i);
  if (sub === "stats") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const data = await communityApi.status(); const s = data.stats ?? {}; const m = data.maintenance ?? {};
    const e = new EmbedBuilder().setTitle("Community overview").setColor(m.enabled?Colors.Orange:Colors.Green)
      .addFields({name:"Backend / DB",value:text(data.status)+" / "+text(data.database),inline:true},{name:"Maintenance",value:m.enabled?"ON: "+text(m.reason):"Off",inline:true},{name:"Accounts",value:String(s.accounts??0),inline:true},{name:"Active presence",value:String(s.active_players??0),inline:true},{name:"Open lobbies",value:String(s.open_sessions??0),inline:true},{name:"Queue entries",value:String(s.queued_players??0),inline:true},{name:"Active bans",value:String(s.active_bans??0),inline:true},{name:"Open reports",value:String(s.open_reports??0),inline:true},{name:"Open tickets",value:String(s.open_tickets??0),inline:true},{name:"Suggestions pending",value:String(s.pending_suggestions??0),inline:true}).setTimestamp();
    await i.editReply({embeds:[e]}); return;
  }
  if (sub === "player") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const u=i.options.getUser("user",true); const r=await communityApi.player(u.id); const p=r.player as Record<string,any>;
    await i.editReply({embeds:[new EmbedBuilder().setTitle("Community player lookup").setThumbnail(u.displayAvatarURL()).setColor(p.isBanned?Colors.Red:Colors.Blurple).addFields({name:"User",value:"<@"+u.id+"> ("+u.id+")"},{name:"Display name",value:text(p.displayName),inline:true},{name:"Rank",value:String(p.rank),inline:true},{name:"Presence",value:text(p.status),inline:true},{name:"Community cash / bank",value:String(p.cash)+" / "+String(p.bank)},{name:"Ban",value:p.isBanned?text(p.banReason)+(p.banExpiresAt?" • expires "+new Date(p.banExpiresAt).toISOString():" • permanent"):"None"})]}); return;
  }
  if (sub === "ban") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const u=i.options.getUser("user",true); const reason=i.options.getString("reason",true); const duration=i.options.getInteger("duration_minutes")??undefined;
    const r=await communityApi.ban(u.id,{...a,discordUserId:u.id,reason,durationMinutes:duration});
    await communityApi.recordAudit({...a,action:"discord.moderation.ban",targetDiscordId:u.id,details:{reason,expiresAt:r.expiresAt??null}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Community account banned").setColor(Colors.Red).addFields({name:"Target",value:"<@"+u.id+">"},{name:"Reason",value:text(reason)},{name:"Duration",value:duration?duration+" minutes":"Permanent"},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Community account for <@"+u.id+"> is banned. This does not ban the user from Discord."); return;
  }
  if (sub === "unban") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const u=i.options.getUser("user",true);
    await communityApi.unban(u.id,a); await communityApi.recordAudit({...a,action:"discord.moderation.unban",targetDiscordId:u.id,details:{}}).catch(()=>undefined);
    await i.editReply("Active community ban revoked for <@"+u.id+">."); return;
  }
  if (sub === "reports") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const status=i.options.getString("status")??"open";
    const r=await communityApi.reports(status,25); const list=(r.reports??[]) as Record<string,any>[];
    const e=new EmbedBuilder().setTitle("Community reports • "+status).setColor(Colors.Orange);
    if (!list.length) e.setDescription("No reports found.");
    for (const x of list.slice(0,15)) e.addFields({name:String(x.id)+" • "+x.category,value:"Reporter <@"+x.reporterDiscordId+"> • target "+(x.targetDiscordId?"<@"+x.targetDiscordId+">":"not specified")+"\\n"+text(x.details,180)+"\\nStatus: "+x.status,inline:false});
    await i.editReply({embeds:[e]}); return;
  }
  if (sub === "resolve-report") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const id=i.options.getString("report_id",true); const status=i.options.getString("outcome",true); const resolution=i.options.getString("resolution",true);
    await communityApi.resolveReport(id,{...a,status,resolution});
    await i.editReply("Report "+id+" marked "+status+"."); return;
  }
  if (sub === "announce") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const r=await communityApi.createAnnouncement({...a,title:i.options.getString("title",true),body:i.options.getString("body",true),severity:i.options.getString("severity",true),durationHours:i.options.getInteger("duration_hours")??undefined});
    const item=r.announcement as Record<string,any>;
    if (botConfig.announcementChannelId) {
      const ch=await client.channels.fetch(botConfig.announcementChannelId).catch(()=>null);
      if (ch?.isTextBased() && "send" in ch) await (ch as any).send({embeds:[announcementEmbed(item)]});
    }
    await logToChannel(client,new EmbedBuilder().setTitle("Announcement published").setColor(severityColor(String(item.severity))).addFields({name:"Title",value:text(item.title)},{name:"ID",value:String(item.id)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Announcement published. ID: "+String(item.id)+(botConfig.announcementChannelId?" and sent to <#"+botConfig.announcementChannelId+">.":"; visible using /announcements.")); return;
  }
  if (sub === "remove-announcement") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const id=i.options.getString("announcement_id",true);
    await communityApi.removeAnnouncement(id,a); await i.editReply("Announcement deactivated: "+id); return;
  }
  if (sub === "maintenance") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const enabled=i.options.getBoolean("enabled",true); const reason=i.options.getString("reason")??undefined;
    const r=await communityApi.setMaintenance({...a,enabled,reason}); const m=r.maintenance as Record<string,any>;
    await logToChannel(client,new EmbedBuilder().setTitle("Maintenance mode "+(enabled?"enabled":"disabled")).setColor(enabled?Colors.Orange:Colors.Green).setDescription(text(m.reason)).setTimestamp());
    await i.editReply(enabled?"Maintenance is ON. Normal /v1 API requests are returning HTTP 503; health checks and bot administration remain available.":"Maintenance is OFF. Normal community API requests are available again."); return;
  }
  if (sub === "audit") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const r=await communityApi.audit(i.options.getInteger("limit")??15); const list=(r.entries??[]) as Record<string,any>[];
    const e=new EmbedBuilder().setTitle("Staff audit log").setColor(Colors.DarkAqua);
    if (!list.length) e.setDescription("No audit events yet.");
    for (const x of list.slice(0,20)) e.addFields({name:"#"+x.id+" • "+x.action,value:"By <@"+x.actorDiscordId+"> • "+new Date(x.createdAt).toISOString()+(x.targetDiscordId?"\\nTarget <@"+x.targetDiscordId+">":"")+"\\n"+text(JSON.stringify(x.details),180),inline:false});
    await i.editReply({embeds:[e]}); return;
  }
  if (sub === "tickets") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const r=await communityApi.tickets(); const list=(r.tickets??[]) as Record<string,any>[];
    const e=new EmbedBuilder().setTitle("Open support tickets").setColor(Colors.Blurple);
    if (!list.length) e.setDescription("No open tickets.");
    for (const x of list.slice(0,20)) e.addFields({name:String(x.id),value:"User <@"+x.openerDiscordId+"> • "+(x.channelId?"<#"+x.channelId+">":"channel not linked")+"\\n"+text(x.topic,150),inline:false});
    await i.editReply({embeds:[e]}); return;
  }
  if (sub === "close-ticket") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); await closeTicketById(i.options.getString("ticket_id",true),i,client,i.options.getString("reason")??undefined);
    await i.editReply("Ticket closed."); return;
  }
  if (sub === "suggestions") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const status=i.options.getString("status")??"pending"; const r=await communityApi.suggestions(status,25); const list=(r.suggestions??[]) as Record<string,any>[];
    const e=new EmbedBuilder().setTitle("Community suggestions • "+status).setColor(Colors.Blurple);
    if (!list.length) e.setDescription("No suggestions found.");
    for (const x of list.slice(0,15)) e.addFields({name:String(x.id)+" • "+x.status,value:"By <@"+x.authorDiscordId+">\\n"+text(x.body,220)+(x.staffNote?"\\nStaff note: "+text(x.staffNote,100):""),inline:false});
    await i.editReply({embeds:[e]}); return;
  }
  if (sub === "update-suggestion") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const id=i.options.getString("suggestion_id",true); const status=i.options.getString("status",true);
    await communityApi.updateSuggestion(id,{...a,status,staffNote:i.options.getString("staff_note")??undefined}); await i.editReply("Suggestion "+id+" updated to "+status+"."); return;
  }
  if (sub === "role") {
    if (!i.guild) { await i.reply({content:"This command is server-only.",flags:MessageFlags.Ephemeral}); return; }
    await i.deferReply({flags:MessageFlags.Ephemeral}); const target=i.options.getUser("user",true); const role=i.options.getRole("role",true) as Role; const action=i.options.getString("action",true);
    if (role.id===i.guild.id || role.managed) { await i.editReply("That role cannot be changed."); return; }
    const botMember=i.guild.members.me ?? await i.guild.members.fetch(client.user!.id);
    if (botMember.roles.highest.comparePositionTo(role)<=0) { await i.editReply("Move the bot's highest role above the target role first."); return; }
    const member=await i.guild.members.fetch(target.id);
    if (action==="add") await member.roles.add(role,"Community staff command by "+i.user.id); else await member.roles.remove(role,"Community staff command by "+i.user.id);
    await communityApi.recordAudit({...a,action:"discord.role."+action,targetDiscordId:target.id,details:{roleId:role.id,roleName:role.name}});
    await logToChannel(client,new EmbedBuilder().setTitle("Member role changed").setColor(Colors.DarkAqua).addFields({name:"Member",value:"<@"+target.id+">"},{name:"Role",value:role.name},{name:"Action",value:action},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Role "+role.name+" "+(action==="add"?"added to ":"removed from ")+"<@"+target.id+">."); return;
  }
  if (sub === "config") {
    await i.reply({flags:MessageFlags.Ephemeral,embeds:[new EmbedBuilder().setTitle("Discord bot configuration").setColor(Colors.Greyple).addFields(
      {name:"Command scope",value:botConfig.guildId?"Development guild: "+botConfig.guildId:"Global commands"},
      {name:"Community API",value:botConfig.apiBaseUrl},
      {name:"Admin roles",value:botConfig.adminRoleIds.map(id=>"<@&"+id+">").join(", ")||"Administrator permission only"},
      {name:"Moderator roles",value:botConfig.moderatorRoleIds.map(id=>"<@&"+id+">").join(", ")||"Manage Messages permission"},
      {name:"Verified role",value:botConfig.verifiedRoleId?"<@&"+botConfig.verifiedRoleId+">":"Not set",inline:true},
      {name:"Logs",value:botConfig.logChannelId?"<#"+botConfig.logChannelId+">":"Not set",inline:true},
      {name:"Announcements",value:botConfig.announcementChannelId?"<#"+botConfig.announcementChannelId+">":"Not set",inline:true},
      {name:"Ticket category",value:botConfig.ticketCategoryId?"<#"+botConfig.ticketCategoryId+">":"Server root",inline:true}
    )]}); return;
  }
}

async function handleMod(i: ChatInputCommandInteraction, client: Client): Promise<void> {
  if (!(await requireModerator(i))) return;
  if (!i.guild) { await i.reply({content:"This command is server-only.",flags:MessageFlags.Ephemeral}); return; }
  const guild = i.guild;
  const sub = i.options.getSubcommand();
  const a = actor(i);

  if (sub === "timeout") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true);
    const minutes = i.options.getInteger("minutes",true);
    const reason = i.options.getString("reason",true);
    if (target.id === i.user.id || target.id === client.user?.id) { await i.editReply("You cannot timeout yourself or the bot."); return; }
    const member = await guild.members.fetch(target.id);
    await member.timeout(minutes * 60_000, reason);
    await communityApi.recordAudit({...a,action:"discord.member.timeout",targetDiscordId:target.id,details:{minutes,reason}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Discord member timed out").setColor(Colors.Orange).addFields({name:"Target",value:"<@"+target.id+">"},{name:"Duration",value:minutes+" minutes"},{name:"Reason",value:text(reason)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Timed out <@"+target.id+"> for "+minutes+" minutes."); return;
  }

  if (sub === "kick") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true); const reason = i.options.getString("reason",true);
    if (target.id === i.user.id || target.id === client.user?.id) { await i.editReply("You cannot kick yourself or the bot."); return; }
    const member = await guild.members.fetch(target.id);
    await member.kick(reason);
    await communityApi.recordAudit({...a,action:"discord.member.kick",targetDiscordId:target.id,details:{reason}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Discord member kicked").setColor(Colors.Red).addFields({name:"Target",value:"<@"+target.id+">"},{name:"Reason",value:text(reason)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Kicked <@"+target.id+"> from Discord. Their community backend account is not automatically banned."); return;
  }

  if (sub === "ban") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true); const reason = i.options.getString("reason",true);
    if (target.id === i.user.id || target.id === client.user?.id) { await i.editReply("You cannot ban yourself or the bot."); return; }
    await guild.members.ban(target.id,{reason});
    await communityApi.recordAudit({...a,action:"discord.member.ban",targetDiscordId:target.id,details:{reason}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Discord member banned").setColor(Colors.Red).addFields({name:"Target",value:"<@"+target.id+">"},{name:"Reason",value:text(reason)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Banned <@"+target.id+"> from this Discord server. This is separate from a community-account ban."); return;
  }

  if (sub === "unban") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const targetId = i.options.getString("user_id",true); const reason = i.options.getString("reason",true);
    if (!/^\d{17,20}$/.test(targetId)) { await i.editReply("Enter a valid numeric Discord user ID."); return; }
    await guild.members.unban(targetId,reason);
    await communityApi.recordAudit({...a,action:"discord.member.unban",targetDiscordId:targetId,details:{reason}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Discord user unbanned").setColor(Colors.Green).addFields({name:"Target ID",value:targetId},{name:"Reason",value:text(reason)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Unbanned Discord user ID "+targetId+"."); return;
  }

  if (sub === "warn") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true); const reason = i.options.getString("reason",true);
    if (target.id === i.user.id) { await i.editReply("You cannot warn yourself."); return; }
    const result = await communityApi.addWarning({...a,targetDiscordId:target.id,targetUsername:target.username,reason});
    const warning = result.warning as Record<string,any>;
    await target.send("You have received a community warning in "+guild.name+". Reason: "+reason).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Community warning issued").setColor(Colors.Orange).addFields({name:"Member",value:"<@"+target.id+">"},{name:"Warning ID",value:String(warning.id)},{name:"Reason",value:text(reason)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Warning recorded for <@"+target.id+">. Warning ID: "+String(warning.id)+"."); return;
  }

  if (sub === "warnings") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true); const result = await communityApi.warnings(target.id); const warnings = (result.warnings??[]) as Record<string,any>[];
    const e = new EmbedBuilder().setTitle("Warning history for "+target.username).setColor(Colors.Orange);
    if (!warnings.length) e.setDescription("No warning records found.");
    for (const w of warnings.slice(0,20)) e.addFields({name:String(w.id)+(w.clearedAt?" • Cleared":" • Active"),value:"Reason: "+text(w.reason,180)+"\nBy: <@"+w.issuedByDiscordId+"> • "+new Date(w.createdAt).toISOString(),inline:false});
    await i.editReply({embeds:[e]}); return;
  }

  if (sub === "clear-warnings") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const target = i.options.getUser("user",true);
    const result = await communityApi.clearWarnings(target.id,a);
    await logToChannel(client,new EmbedBuilder().setTitle("Warnings cleared").setColor(Colors.Green).addFields({name:"Member",value:"<@"+target.id+">"},{name:"Count",value:String(result.count??0)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Cleared "+String(result.count??0)+" active warning(s) for <@"+target.id+">."); return;
  }

  if (sub === "purge") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const amount = i.options.getInteger("amount",true);
    const channel:any = i.channel;
    if (!channel || typeof channel.bulkDelete !== "function") { await i.editReply("Use this in a regular text channel that supports bulk deletion."); return; }
    const deleted = await channel.bulkDelete(amount,true);
    await communityApi.recordAudit({...a,action:"discord.channel.purge",details:{channelId:i.channelId,requested:amount,deleted:deleted.size}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Channel messages purged").setColor(Colors.Orange).addFields({name:"Channel",value:"<#"+i.channelId+">"},{name:"Deleted",value:String(deleted.size)},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply("Deleted "+deleted.size+" recent message(s). Discord does not bulk-delete messages older than 14 days."); return;
  }

  if (sub === "lock" || sub === "unlock") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const channel:any = i.channel;
    if (!channel || !channel.permissionOverwrites || !i.guild) { await i.editReply("Use this in a text channel with permission overwrites."); return; }
    await channel.permissionOverwrites.edit(guild.roles.everyone.id,{SendMessages:sub==="lock"?false:null});
    await communityApi.recordAudit({...a,action:"discord.channel."+sub,details:{channelId:i.channelId}}).catch(()=>undefined);
    await logToChannel(client,new EmbedBuilder().setTitle("Channel "+(sub==="lock"?"locked":"unlocked")).setColor(Colors.DarkAqua).addFields({name:"Channel",value:"<#"+i.channelId+">"},{name:"Staff",value:"<@"+i.user.id+">"}).setTimestamp());
    await i.editReply(sub==="lock"?"Locked @everyone from sending messages in this channel.":"Restored inherited @everyone send permissions for this channel."); return;
  }
}

export async function handleCommand(client: Client, i: ChatInputCommandInteraction): Promise<void> {
  const name=i.commandName;
  if (name==="ping") { await i.reply({content:"Pong! Gateway latency: "+Math.max(0,client.ws.ping)+" ms.",flags:MessageFlags.Ephemeral}); return; }
  if (name==="help") {
    await i.reply({flags:MessageFlags.Ephemeral,embeds:[new EmbedBuilder().setTitle("1.61ONLINE community bot").setColor(Colors.Blurple).setDescription("Account onboarding, status, player discovery, support, reports, suggestions, announcements, and staff tools.").addFields(
      {name:"Community",value:"/signup • /verify • /profile • /players • /status • /sessions • /announcements"},
      {name:"Help & feedback",value:"/report • /ticket create • /ticket close • /suggest"},
      {name:"Info",value:"/rules • /faq • /ping"},
      {name:"Staff",value:"/admin and /mod provide account moderation, Discord moderation, warning history, reports, announcements, maintenance, tickets, suggestions, audit, and role tools."}
    ).setFooter({text:"Staff commands are permission checked."})]}); return;
  }
  if (name==="signup") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const r=await communityApi.signup({discordUserId:i.user.id,username:i.user.username,globalName:i.user.globalName,avatarUrl:i.user.displayAvatarURL({extension:"png",size:256})});
    let roleNotice="";
    try { if (botConfig.verifiedRoleId && i.guild) { await assignVerified(i.guild,i.user.id); roleNotice="\\nVerified role assigned."; } }
    catch { roleNotice="\\nAccount created, but role assignment failed. Ask staff to check Manage Roles and role order."; }
    const account=r.account as Record<string,any>;
    await i.editReply((r.created?"✅ Community account created.":"✅ You already had an account; your Discord profile was refreshed.")+"\\nDisplay name: "+text(account.displayName)+"\\nCommunity ID: "+String(account.id)+"\\nRank: "+String(account.rank??1)+roleNotice+"\\n\\nThis is a 1.61ONLINE Discord-linked identity, not a Rockstar account.");
    await logToChannel(client,new EmbedBuilder().setTitle("Community signup").setColor(Colors.Green).addFields({name:"Member",value:"<@"+i.user.id+">"},{name:"Community ID",value:String(account.id)}).setTimestamp()); return;
  }
  if (name==="verify") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if (!i.guild) { await i.editReply("Run this in the community server."); return; }
    if (!botConfig.verifiedRoleId) { await i.editReply("Verified role is not configured. Set DISCORD_VERIFIED_ROLE_ID."); return; }
    await communityApi.player(i.user.id); await assignVerified(i.guild,i.user.id); await i.editReply("You are verified."); return;
  }
  if (name==="profile") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const u=i.options.getUser("user")??i.user; const r=await communityApi.player(u.id); const p=r.player as Record<string,any>;
    await i.editReply({embeds:[new EmbedBuilder().setTitle("Community profile").setThumbnail(u.displayAvatarURL()).setColor(p.isBanned?Colors.Red:Colors.Blurple).addFields({name:"Discord",value:"<@"+u.id+">",inline:true},{name:"Display name",value:text(p.displayName),inline:true},{name:"Rank",value:String(p.rank),inline:true},{name:"Presence",value:text(p.status),inline:true},{name:"Community cash / bank",value:String(p.cash)+" / "+String(p.bank)})]}); return;
  }
  if (name==="status") {
    await i.deferReply(); const r=await communityApi.status(); const s=r.stats??{}; const m=r.maintenance??{};
    await i.editReply({embeds:[new EmbedBuilder().setTitle("1.61ONLINE status").setColor(m.enabled?Colors.Orange:Colors.Green).setDescription(m.enabled?"Maintenance mode: "+text(m.reason):"Community API reports normal service.").addFields({name:"Backend",value:text(r.status),inline:true},{name:"Database",value:text(r.database),inline:true},{name:"Accounts",value:String(s.accounts??0),inline:true},{name:"Active presence",value:String(s.active_players??0),inline:true},{name:"Open lobby records",value:String(s.open_sessions??0),inline:true},{name:"Queue entries",value:String(s.queued_players??0),inline:true},{name:"Open reports",value:String(s.open_reports??0),inline:true},{name:"Open tickets",value:String(s.open_tickets??0),inline:true}).setFooter({text:"This is the community backend, not Rockstar service status."}).setTimestamp()]}); return;
  }
  if (name==="players") {
    await i.deferReply(); const r=await communityApi.players(i.options.getString("query")??undefined,10); const list=(r.players??[]) as Record<string,any>[]; const e=new EmbedBuilder().setTitle("Community players").setColor(Colors.Blurple);
    if (!list.length) e.setDescription("No Discord-linked players found.");
    for (const p of list.slice(0,10)) e.addFields({name:text(p.displayName,80),value:"<@"+p.discordUserId+">\\nRank "+p.rank+" • "+text(p.status),inline:true});
    await i.editReply({embeds:[e]}); return;
  }
  if (name==="sessions") {
    await i.deferReply(); const r=await communityApi.sessions(); const list=(r.sessions??[]) as Record<string,any>[]; const e=new EmbedBuilder().setTitle("Public community lobbies").setColor(Colors.Blurple).setDescription("These are backend lobby records, not proof that gameplay servers are connected.");
    if (!list.length) e.addFields({name:"No open lobbies",value:"No public lobby records right now."});
    for (const x of list.slice(0,10)) e.addFields({name:text(x.name,80),value:"ID: "+x.id+"\\nMode: "+text(x.gameMode)+" • Region: "+text(x.region)+"\\nPlayers: "+x.playerCount+"/"+x.maxPlayers});
    await i.editReply({embeds:[e]}); return;
  }
  if (name==="announcements") {
    await i.deferReply(); const r=await communityApi.announcements(); const list=(r.announcements??[]) as Record<string,any>[];
    await i.editReply(list.length?{embeds:list.slice(0,10).map(announcementEmbed)}:{content:"No active community announcements."}); return;
  }
  if (name==="report") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const target=i.options.getUser("target");
    const r=await communityApi.submitReport({reporterDiscordId:i.user.id,reporterUsername:i.user.username,targetDiscordId:target?.id,targetUsername:target?.username,category:i.options.getString("category",true),details:i.options.getString("details",true)});
    const report=r.report as Record<string,any>;
    await logToChannel(client,new EmbedBuilder().setTitle("New community report").setColor(Colors.Orange).addFields({name:"Report ID",value:String(report.id)},{name:"Reporter",value:"<@"+i.user.id+">"},{name:"Target",value:target?"<@"+target.id+">":"Not specified"},{name:"Category",value:i.options.getString("category",true)}).setTimestamp());
    await i.editReply("Report submitted privately. ID: "+String(report.id)+". Never include passwords or tokens."); return;
  }
  if (name==="suggest") {
    await i.deferReply({flags:MessageFlags.Ephemeral}); const r=await communityApi.createSuggestion({authorDiscordId:i.user.id,authorUsername:i.user.username,body:i.options.getString("idea",true)}); const s=r.suggestion as Record<string,any>;
    await i.editReply("Suggestion submitted. ID: "+String(s.id)+". Staff can review it using /admin suggestions."); return;
  }
  if (name==="rules") {
    await i.reply({flags:MessageFlags.Ephemeral,embeds:[new EmbedBuilder().setTitle("Community rules").setColor(Colors.Blurple).setDescription("1. Treat members respectfully.\\n2. No harassment, threats, hate, doxxing, or targeted abuse.\\n3. Do not exploit the backend or access accounts without authorization.\\n4. Never post passwords, refresh tokens, or API keys.\\n5. Make honest reports and include relevant facts.\\n6. Follow Discord's Terms and Community Guidelines.\\n7. This project is community-run, not an official Rockstar service.")]}); return;
  }
  if (name==="faq") {
    await i.reply({flags:MessageFlags.Ephemeral,embeds:[new EmbedBuilder().setTitle("Community FAQ").setColor(Colors.Blurple).addFields({name:"What does signup do?",value:"Creates a Discord-linked community identity; it does not create a Rockstar account."},{name:"Is gameplay available?",value:"The backend is under development. Presence, social tools, lobby records, and queue storage do not mean gameplay networking is ready."},{name:"How to get support?",value:"Use /ticket create for a private support channel."},{name:"Report an issue?",value:"Use /report. Staff can review it with /admin reports."},{name:"Suggest a feature?",value:"Use /suggest."},{name:"Are rank and cash real GTA Online values?",value:"No. Those are community database fields."})]}); return;
  }
  if (name==="ticket") {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if (i.options.getSubcommand()==="create") await openTicket(i,client);
    else await closeTicketHere(i,client,i.options.getString("reason")??undefined);
    return;
  }
  if (name==="mod") { await handleMod(i,client); return; }
  if (name==="admin") { await handleAdmin(i,client); return; }
}

export function friendlyError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.status===0) return "The community API is unreachable. Check backend uptime and COMMUNITY_API_BASE_URL.";
    if (error.status===401) return "Bot authentication failed. DISCORD_BOT_API_KEY must match the backend setting.";
    if (error.status===403) return "This action is not allowed for the current account.";
    if (error.status===404 && error.message==="discord_account_not_found") return "That user has not signed up yet. Ask them to use /signup.";
    if (error.status===404 && error.message==="active_ban_not_found") return "That player has no active community ban.";
    if (error.status===503 && error.message==="discord_integration_not_configured") return "The backend needs DISCORD_BOT_API_KEY configured.";
    if (error.status===409 && error.message==="ticket_already_open") return "You already have an open ticket.";
    return "The community API rejected the request: "+error.message+".";
  }
  if (error instanceof Error && error.message==="Open ticket not found. Check the ticket UUID and current status.") return error.message;
  if (error instanceof Error && error.message==="verified_role_not_configured") return "The verified role is not configured.";
  if (error instanceof Error && error.message==="verified_role_not_found") return "The configured verified role no longer exists.";
  return "Something went wrong. Check the bot/backend logs and try again.";
}
