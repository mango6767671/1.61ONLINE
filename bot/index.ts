import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import pg from "pg";

const env = process.env;
if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID || !env.DATABASE_URL) throw new Error("Set DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID and DATABASE_URL.");
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
const admins = new Set((env.DISCORD_ADMIN_ROLE_IDS || "").split(",").filter(Boolean));
const mods = new Set((env.DISCORD_MOD_ROLE_IDS || "").split(",").filter(Boolean));
const commands = [
 new SlashCommandBuilder().setName("help").setDescription("Show all community bot commands"),
 new SlashCommandBuilder().setName("status").setDescription("Show backend and community status"),
 new SlashCommandBuilder().setName("signup").setDescription("Get the secure community account registration link"),
 new SlashCommandBuilder().setName("profile").setDescription("Show your linked community profile"),
 new SlashCommandBuilder().setName("players").setDescription("List recently active players"),
 new SlashCommandBuilder().setName("sessions").setDescription("List public community sessions"),
 new SlashCommandBuilder().setName("admin").setDescription("Staff management commands")
  .addSubcommand(s=>s.setName("stats").setDescription("Community statistics"))
  .addSubcommand(s=>s.setName("lookup").setDescription("Look up a player").addStringOption(o=>o.setName("query").setDescription("Exact email or display name").setRequired(true)))
  .addSubcommand(s=>s.setName("ban").setDescription("Ban a player").addStringOption(o=>o.setName("email").setDescription("Exact account email").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)))
  .addSubcommand(s=>s.setName("unban").setDescription("Unban a player").addStringOption(o=>o.setName("email").setDescription("Exact account email").setRequired(true)))
  .addSubcommand(s=>s.setName("maintenance").setDescription("Set maintenance mode").addBooleanOption(o=>o.setName("enabled").setDescription("Enable maintenance").setRequired(true)).addStringOption(o=>o.setName("message").setDescription("Player-facing message")))
  .addSubcommand(s=>s.setName("announce").setDescription("Post an announcement").addStringOption(o=>o.setName("message").setDescription("Announcement").setRequired(true).setMaxLength(1800)))
].map(x=>x.toJSON());
const client = new Client({intents:[GatewayIntentBits.Guilds]});
function rolesOf(i) { if(!i.inGuild() || !i.member || !("roles" in i.member)) return []; const r=i.member.roles; return Array.isArray(r)?r:r.cache.map(x=>x.id); }
function staff(i, adminOnly=false) { const r=rolesOf(i); return r.some(x=>admins.has(x) || (!adminOnly && mods.has(x))); }
async function reply(i,content) { return i.reply({content,ephemeral:true,allowedMentions:{parse:[]}}); }
async function log(message) { if(!env.DISCORD_LOG_CHANNEL_ID)return; const c=await client.channels.fetch(env.DISCORD_LOG_CHANNEL_ID).catch(()=>null); if(c && c.isTextBased() && "send" in c) await c.send({content:message,allowedMentions:{parse:[]}}).catch(()=>{}); }
async function lookup(email) { const r=await pool.query("SELECT u.id,u.email,p.display_name,p.rank,d.discord_user_id FROM users u JOIN player_profiles p ON p.user_id=u.id LEFT JOIN discord_accounts d ON d.user_id=u.id WHERE lower(u.email)=lower($1)",[email]); return r.rows[0]; }

client.once("ready",async()=>{
 const rest=new REST({version:"10"}).setToken(env.DISCORD_BOT_TOKEN);
 if(env.DISCORD_GUILD_ID) await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,env.DISCORD_GUILD_ID),{body:commands});
 else await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID),{body:commands});
 console.log("Community bot online as "+client.user.tag);
});
client.on("interactionCreate",async i=>{
 if(!i.isChatInputCommand())return;
 try {
  if(i.commandName==="help") return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle("Community Revival Bot").setDescription("Account, player and staff hub").addFields(
   {name:"Players",value:"/signup · /profile · /players · /sessions · /status"},
   {name:"Staff",value:"/admin stats · lookup · ban · unban · maintenance · announce"},
   {name:"Security",value:"Staff commands are role-gated. Private lookups and account information are ephemeral."})]});
  if(i.commandName==="signup") {
   if(!env.DISCORD_REGISTER_URL)return reply(i,"Registration link is not configured. Contact staff.");
   return i.reply({ephemeral:true,content:"Create your account on the official registration page. Never send your password to a Discord bot or moderator.",components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Register account").setStyle(ButtonStyle.Link).setURL(env.DISCORD_REGISTER_URL))]});
  }
  if(i.commandName==="status") {
   const r=await pool.query("SELECT (SELECT count(*)::int FROM users) accounts,(SELECT count(*)::int FROM player_presence WHERE last_seen_at>NOW()-INTERVAL '90 seconds') online,(SELECT count(*)::int FROM game_sessions WHERE state='open') sessions");
   const m=await pool.query("SELECT value FROM service_settings WHERE key='maintenance'");
   const maintenance=m.rows[0]?.value?.enabled===true;
   return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setColor(maintenance?0xf1c40f:0x2ecc71).setTitle("Community status").addFields(
    {name:"Database",value:"Connected",inline:true},{name:"Accounts",value:String(r.rows[0].accounts),inline:true},{name:"Online",value:String(r.rows[0].online),inline:true},{name:"Open sessions",value:String(r.rows[0].sessions),inline:true},{name:"Maintenance",value:maintenance?"ON":"OFF",inline:true})]});
  }
  if(i.commandName==="profile") {
   const r=await pool.query("SELECT p.display_name,p.rank,p.cash::text,p.bank::text,u.id FROM discord_accounts d JOIN player_profiles p ON p.user_id=d.user_id JOIN users u ON u.id=d.user_id WHERE d.discord_user_id=$1",[i.user.id]);
   if(!r.rowCount)return reply(i,"No Discord account link found yet. Use /signup to register; account linking will be enabled when the secure linking flow is deployed.");
   const p=r.rows[0]; return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(p.display_name||"Player profile").addFields({name:"Rank",value:String(p.rank),inline:true},{name:"Cash",value:p.cash,inline:true},{name:"Bank",value:p.bank,inline:true},{name:"Account ID",value:p.id})]});
  }
  if(i.commandName==="players") {
   const r=await pool.query("SELECT coalesce(pp.display_name,'Player') name,p.status FROM player_presence p JOIN player_profiles pp ON pp.user_id=p.user_id WHERE p.last_seen_at>NOW()-INTERVAL '90 seconds' ORDER BY p.last_seen_at DESC LIMIT 15");
   return reply(i,r.rowCount?r.rows.map(x=>"• "+x.name+" — "+x.status).join("\n"):"No players online right now.");
  }
  if(i.commandName==="sessions") {
   const r=await pool.query("SELECT s.name,s.region,s.game_mode,count(m.user_id)::int players,s.max_players FROM game_sessions s LEFT JOIN session_members m ON m.session_id=s.id WHERE s.state='open' AND s.visibility='public' GROUP BY s.id ORDER BY s.created_at DESC LIMIT 10");
   return reply(i,r.rowCount?r.rows.map(x=>"• "+x.name+" — "+x.players+"/"+x.max_players+" · "+x.region+" · "+x.game_mode).join("\n"):"No public sessions are open.");
  }
  if(i.commandName==="admin") {
   const sub=i.options.getSubcommand();
   if(!staff(i,["stats","maintenance","announce"].includes(sub)))return reply(i,"You do not have the required staff role.");
   if(sub==="stats") {
    const r=await pool.query("SELECT (SELECT count(*)::int FROM users) accounts,(SELECT count(*)::int FROM discord_accounts) linked,(SELECT count(*)::int FROM player_presence WHERE last_seen_at>NOW()-INTERVAL '90 seconds') online,(SELECT count(*)::int FROM game_sessions WHERE state='open') sessions,(SELECT count(*)::int FROM matchmaking_queue) queued,(SELECT count(*)::int FROM moderation_bans WHERE expires_at IS NULL OR expires_at>NOW()) banned");
    return reply(i,Object.entries(r.rows[0]).map(([k,v])=>"**"+k+"**: "+v).join("\n"));
   }
   if(sub==="lookup") {
    const q=i.options.getString("query",true);
    const r=await pool.query("SELECT u.id,u.email,p.display_name,p.rank,d.discord_user_id FROM users u JOIN player_profiles p ON p.user_id=u.id LEFT JOIN discord_accounts d ON d.user_id=u.id WHERE lower(u.email)=lower($1) OR p.display_name ILIKE $2 LIMIT 5",[q,q]);
    return reply(i,r.rowCount?r.rows.map(p=>"**"+(p.display_name||"Unnamed")+"** · "+p.email+" · rank "+p.rank+" · id "+p.id+" · Discord "+(p.discord_user_id||"not linked")).join("\n"):"No matching account.");
   }
   if(sub==="ban" || sub==="unban") {
    if(!staff(i))return reply(i,"Moderator role required.");
    const p=await lookup(i.options.getString("email",true)); if(!p)return reply(i,"Account not found. Use the exact email address.");
    if(sub==="ban") {
     const reason=i.options.getString("reason",true);
     await pool.query("INSERT INTO moderation_bans(user_id,reason,moderator_discord_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET reason=EXCLUDED.reason,moderator_discord_id=EXCLUDED.moderator_discord_id,created_at=NOW(),expires_at=NULL",[p.id,reason,i.user.id]);
     await pool.query("INSERT INTO moderation_actions(target_user_id,moderator_discord_id,action,reason) VALUES($1,$2,'ban',$3)",[p.id,i.user.id,reason]);
     await log("BAN: "+p.email+" by "+i.user.tag+" — "+reason); return reply(i,"Banned "+p.email+".");
    }
    const r=await pool.query("DELETE FROM moderation_bans WHERE user_id=$1",[p.id]);
    await pool.query("INSERT INTO moderation_actions(target_user_id,moderator_discord_id,action) VALUES($1,$2,'unban')",[p.id,i.user.id]);
    await log("UNBAN: "+p.email+" by "+i.user.tag); return reply(i,r.rowCount?"Unbanned "+p.email+".":"That account was not banned.");
   }
   if(sub==="maintenance") {
    const enabled=i.options.getBoolean("enabled",true),message=i.options.getString("message")||"Community services are under maintenance.";
    await pool.query("INSERT INTO service_settings(key,value,updated_by_discord_id) VALUES('maintenance',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by_discord_id=EXCLUDED.updated_by_discord_id,updated_at=NOW()",[JSON.stringify({enabled,message}),i.user.id]);
    await pool.query("INSERT INTO moderation_actions(moderator_discord_id,action,reason) VALUES($1,$2,$3)",[i.user.id,enabled?"maintenance_on":"maintenance_off",message]);
    await log("Maintenance "+(enabled?"ON":"OFF")+" by "+i.user.tag+": "+message);
    return reply(i,"Maintenance flag set to "+(enabled?"ON":"OFF")+". Note: this records the state; API-wide request blocking is not wired yet.");
   }
   if(sub==="announce") {
    if(!env.DISCORD_ANNOUNCEMENT_CHANNEL_ID)return reply(i,"Announcement channel is not configured.");
    const c=await client.channels.fetch(env.DISCORD_ANNOUNCEMENT_CHANNEL_ID);
    if(!c||!c.isTextBased()||!("send" in c))return reply(i,"Announcement channel unavailable.");
    await c.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle("Community announcement").setDescription(i.options.getString("message",true)).setTimestamp()],allowedMentions:{parse:[]}});
    await log("Announcement posted by "+i.user.tag); return reply(i,"Announcement sent.");
   }
  }
 } catch(e) { console.error(e); if(i.replied||i.deferred) await i.followUp({content:"Command failed. Check bot logs.",ephemeral:true}).catch(()=>{}); else await reply(i,"Command failed. Check bot logs.").catch(()=>{}); }
});
process.on("SIGINT",()=>{void client.destroy();void pool.end();});
process.on("SIGTERM",()=>{void client.destroy();void pool.end();});
await client.login(env.DISCORD_BOT_TOKEN);
