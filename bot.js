const { Client, GatewayIntentBits, Events } = require('discord.js');

let client;

async function startDiscordBot(token) {
  if (!token) {
    console.warn('[VANDAL BOT] No bot token found. Set DISCORD_BOT_TOKEN in Railway Variables.');
    return null;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once(Events.ClientReady, readyClient => {
    console.log(`[VANDAL BOT] Online as ${readyClient.user.tag}`);
    readyClient.user.setPresence({
      status: 'online',
      activities: [{ name: 'VANDAL Store', type: 0 }]
    }).catch(error => console.error('[VANDAL BOT] Presence update failed:', error.message));
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
