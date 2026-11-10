const { Client, GatewayIntentBits, Events } = require('discord.js');

let client;

async function startDiscordBot(token) {
  if (!token) {
    console.warn('[VANDAL BOT] No bot token found. Set DISCORD_BOT_TOKEN in Railway Variables.');
    return null;
  }

  // Privileged intents are optional so a missing Developer Portal toggle does
  // not take the existing website bot offline. Enable them in Discord first,
  // then set DISCORD_DASHBOARD_INTENTS=true to receive member/presence updates.
  const dashboardIntents = String(process.env.DISCORD_DASHBOARD_INTENTS || '').toLowerCase() === 'true';
  const intents = [GatewayIntentBits.Guilds];
  if (dashboardIntents) {
    intents.push(
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    );
  }

  client = new Client({ intents });

  client.once(Events.ClientReady, readyClient => {
    console.log(`[VANDAL BOT] Online as ${readyClient.user.tag}`);
    if (!dashboardIntents) {
      console.warn('[VANDAL BOT] Dashboard member/presence/message intents are disabled. Enable them in the Discord Developer Portal, then set DISCORD_DASHBOARD_INTENTS=true to turn them on.');
    }
    try {
      readyClient.user.setPresence({
        status: 'online',
        activities: [{ name: 'VANDAL Store', type: 0 }]
      });
    } catch (error) {
      console.error('[VANDAL BOT] Presence update failed:', error.message);
    }
  });

  client.on(Events.Error, error => {
    console.error('[VANDAL BOT] Discord client error:', error.message);
  });

  try {
    await client.login(token);
    return client;
  } catch (error) {
    console.error('[VANDAL BOT] Login failed. Check the Railway bot token and bot configuration:', error.message);
    client.destroy();
    client = null;
    return null;
  }
}

module.exports = { startDiscordBot };
