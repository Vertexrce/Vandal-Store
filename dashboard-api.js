const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const SERVER_FILE = 'servers.json';
const SETTINGS_FILE = 'dashboard-settings.json';
const AUDIT_FILE = 'rcon-audit.json';
const GUILD_CHANNEL_TYPES = new Set([0, 5]);
const SERVER_STATUS_TTL_MS = 15_000;

function isPublicIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (normalized.startsWith('2') || normalized.startsWith('3')) &&
      !normalized.startsWith('2001:db8:');
  }
  return false;
}

function normalizeHost(value) {
  const host = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (
    host.length > 253 ||
    /[\/\\@?#\s\u0000-\u001f]/.test(host) ||
    host.toLowerCase() === 'localhost' ||
    host.toLowerCase().endsWith('.localhost') ||
    host.toLowerCase().endsWith('.local')
  ) {
    throw new Error('Enter a public server IP address or hostname without a URL or port.');
  }
  if (net.isIP(host)) return host;
  if (!/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(host)) {
    throw new Error('Enter a valid public server hostname or IP address.');
  }
  return host;
}

async function assertPublicHost(host) {
  const normalized = normalizeHost(host);
  let addresses;
  if (net.isIP(normalized)) {
    addresses = [{ address: normalized }];
  } else {
    try {
      addresses = await dns.lookup(normalized, { all: true, verbatim: true });
    } catch {
      throw new Error('The server hostname did not resolve. Check the hostname and try again.');
    }
  }
  if (!addresses.length || addresses.some(entry => !isPublicIp(entry.address))) {
    throw new Error('RCON connections are limited to publicly reachable game servers.');
  }
  return normalized;
}

function formatHost(host) {
  return net.isIP(host) === 6 ? `[${host}]` : host;
}

function rconUrls(host, port, password) {
  const base = `ws://${formatHost(host)}:${port}`;
  const encoded = encodeURIComponent(password).replace(/%2F/gi, '%2F');
  return [
    base,
    `${base}/${encoded}`,
    `${base}/?password=${encoded}`,
    `${base}/ws`,
    `${base}/ws/${encoded}`
  ];
}

function openRconSocket(url, command, identifier, timeoutMs, responseTimeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let opened = false;
    let settled = false;
    let responseTimer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimer);
      clearTimeout(responseTimer);
      try { socket.close(); } catch {}
      if (error) reject(error);
      else resolve(result);
    };
    const openTimer = setTimeout(() => finish(new Error('Connection timed out.')), timeoutMs);

    socket.addEventListener('open', () => {
      opened = true;
      try {
        socket.send(JSON.stringify({ Identifier: identifier, Message: command, Name: 'VandalWebAdmin' }));
      } catch {
        finish(new Error('Could not send the RCON command.'));
        return;
      }
      responseTimer = setTimeout(() => finish(null, { connected: true, response: '' }), responseTimeoutMs);
    }, { once: true });

    socket.addEventListener('message', event => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.Identifier !== undefined && Number(parsed.Identifier) !== identifier) return;
          message = parsed.Message ?? parsed.message ?? raw;
          if (typeof message !== 'string') message = JSON.stringify(message, null, 2);
        }
      } catch {}
      finish(null, { connected: true, response: message });
    });

    socket.addEventListener('error', () => {
      if (opened) finish(null, { connected: true, response: '' });
      else finish(new Error('Could not reach the RCON endpoint.'));
    }, { once: true });

    socket.addEventListener('close', () => {
      if (settled) return;
      if (opened) finish(null, { connected: true, response: '' });
      else finish(new Error('RCON connection was refused.'));
    }, { once: true });
  });
}

async function sendRcon(host, port, password, command, options = {}) {
  const safeHost = await assertPublicHost(host);
  const identifier = crypto.randomInt(1000, 1_000_000);
  let lastError = 'Could not connect to the RCON server.';
  for (const url of rconUrls(safeHost, port, password)) {
    try {
      // Once a socket opens, never retry a write command: a server may have
      // executed it even when it does not return a reply.
      return await openRconSocket(
        url,
        command,
        identifier,
        options.openTimeoutMs || 4_000,
        options.responseTimeoutMs || 4_000
      );
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError);
}

function parsePopulation(response) {
  if (!response) return {};
  let value = response;
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth += 1) {
    try { value = JSON.parse(value); }
    catch { break; }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const fields = Object.fromEntries(Object.entries(value).map(([key, item]) => [key.toLowerCase(), item]));
    const asNumber = (...keys) => {
      for (const key of keys) {
        const raw = fields[key];
        if (raw === undefined || raw === null || raw === '') continue;
        const direct = Number(raw);
        if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));
        const match = String(raw).replace(/,/g, '').match(/-?\d+/);
        if (match) return Math.max(0, Number(match[0]));
      }
      return null;
    };
    return {
      playerCount: asNumber('players', 'playercount', 'currentplayers'),
      maxPlayers: asNumber('maxplayers', 'maxplayerscount', 'max_players'),
      queue: asNumber('queued', 'queue', 'queuedplayers')
    };
  }
  const text = String(value);
  const getTextNumber = (...keys) => {
    const key = keys.join('|');
    const match = text.match(new RegExp(`(?:${key})\\s*[:=]\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
  };
  return {
    playerCount: getTextNumber('players', 'playercount', 'currentplayers'),
    maxPlayers: getTextNumber('maxplayers', 'maxplayerscount'),
    queue: getTextNumber('queued', 'queue', 'queuedplayers')
  };
}

function withoutPassword(server) {
  const { password, ...safe } = server;
  return { ...safe, passwordConfigured: Boolean(password) };
}

function createDashboardApi(app, options) {
  const { DATA_DIR, GUILD_ID, ADMIN_ROLE_ID, BOT_TOKEN, requireAdmin, readProducts } = options;
  const filePath = name => path.join(DATA_DIR, name);
  const statusCache = new Map();
  let overviewCache = null;
  let channelsCache = null;

  async function readJson(name, fallback) {
    await fs.promises.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    try {
      return JSON.parse(await fs.promises.readFile(filePath(name), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async function writeJson(name, value) {
    await fs.promises.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    const target = filePath(name);
    const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporary, target);
  }

  async function readServers() {
    const servers = await readJson(SERVER_FILE, []);
    return Array.isArray(servers) ? servers : [];
  }

  async function getServerStatus(server) {
    const cached = statusCache.get(server.id);
    if (cached?.promise) return cached.promise;
    if (cached?.status && Date.now() - cached.checkedAt < SERVER_STATUS_TTL_MS) return cached;
    const entry = { checkedAt: Date.now(), promise: null };
    entry.promise = (async () => {
      try {
        const result = await sendRcon(server.host, server.port, server.password, 'serverinfo', {
          openTimeoutMs: 3_000,
          responseTimeoutMs: 3_000
        });
        const status = {
          id: server.id,
          name: server.name,
          region: server.region || '',
          online: true,
          ...parsePopulation(result.response),
          checkedAt: new Date().toISOString()
        };
        const value = { checkedAt: Date.now(), status };
        statusCache.set(server.id, value);
        return value;
      } catch {
        const status = {
          id: server.id,
          name: server.name,
          region: server.region || '',
          online: false,
          playerCount: null,
          maxPlayers: null,
          queue: null,
          checkedAt: new Date().toISOString()
        };
        const value = { checkedAt: Date.now(), status };
        statusCache.set(server.id, value);
        return value;
      }
    })();
    statusCache.set(server.id, entry);
    return entry.promise;
  }

  async function discordRequest(apiPath) {
    if (!BOT_TOKEN) throw new Error('Discord bot token is not configured.');
    const response = await fetch(`https://discord.com/api/v10${apiPath}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || `Discord API returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function getGuildChannels(force = false) {
    if (!force && channelsCache && Date.now() - channelsCache.at < 60_000) return channelsCache.channels;
    const channels = await discordRequest(`/guilds/${GUILD_ID}/channels`);
    const textChannels = channels
      .filter(channel => GUILD_CHANNEL_TYPES.has(channel.type))
      .map(({ id, name, type, parent_id }) => ({ id, name, type, parentId: parent_id || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    channelsCache = { at: Date.now(), channels: textChannels };
    return textChannels;
  }

  async function countStaffMembers() {
    let after = '0';
    let staffCount = 0;
    let pages = 0;
    while (pages < 100) {
      const members = await discordRequest(`/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
      if (!Array.isArray(members)) throw new Error('Discord did not return a member list.');
      staffCount += members.filter(member => Array.isArray(member.roles) && member.roles.includes(ADMIN_ROLE_ID)).length;
      if (members.length < 1000) return staffCount;
      const lastId = members[members.length - 1]?.user?.id;
      if (!lastId || lastId === after) break;
      after = lastId;
      pages += 1;
    }
    return null;
  }

  async function getOverview(force = false) {
    if (!force && overviewCache && Date.now() - overviewCache.at < 60_000) return overviewCache.value;
    let guild = null;
    let staffCount = null;
    let discordError = null;
    try {
      guild = await discordRequest(`/guilds/${GUILD_ID}?with_counts=true`);
    } catch (error) {
      discordError = error.message;
    }
    if (guild) {
      try { staffCount = await countStaffMembers(); }
      catch (error) { discordError = error.message; }
    }
    const value = {
      guildId: GUILD_ID,
      guildName: guild?.name || 'VANDAL',
      memberCount: Number.isFinite(guild?.approximate_member_count) ? guild.approximate_member_count : null,
      onlineDiscordUsers: Number.isFinite(guild?.approximate_presence_count) ? guild.approximate_presence_count : null,
      staffCount,
      productsCount: (await readProducts()).length,
      discordConnected: Boolean(guild),
      discordError
    };
    overviewCache = { at: Date.now(), value };
    return value;
  }

  async function getChannelMessages(channelId, limit = 30) {
    const channels = await getGuildChannels();
    if (!channels.some(channel => channel.id === channelId)) {
      const error = new Error('That channel is not a readable text channel in the configured VANDAL server.');
      error.status = 404;
      throw error;
    }
    const messages = await discordRequest(`/channels/${channelId}/messages?limit=${Math.min(50, Math.max(1, limit))}`);
    return messages.map(message => ({
      id: message.id,
      author: message.author?.global_name || message.author?.username || 'Discord user',
      authorId: message.author?.id || '',
      avatar: message.author?.avatar || null,
      content: message.content || '',
      timestamp: message.timestamp,
      embeds: (message.embeds || []).slice(0, 3).map(embed => ({
        title: embed.title || '',
        description: embed.description || '',
        fields: (embed.fields || []).slice(0, 8).map(field => ({
          name: field.name || '',
          value: field.value || ''
        }))
      }))
    }));
  }

  app.get('/api/products', async (req, res) => {
    try { res.json(await readProducts()); }
    catch (error) { console.error('Could not read public products:', error.message); res.status(500).json({ error: 'Could not load store products.' }); }
  });

  app.get('/api/servers', async (req, res) => {
    try {
      const servers = await readServers();
      const statuses = await Promise.all(servers.map(async server => (await getServerStatus(server)).status));
      res.set('Cache-Control', 'no-store');
      res.json(statuses);
    } catch (error) {
      console.error('Could not load public server status:', error.message);
      res.status(500).json({ error: 'Could not load server status.' });
    }
  });

  app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    try { res.json(await getOverview(req.query.refresh === '1')); }
    catch (error) { console.error('Could not load dashboard overview:', error.message); res.status(500).json({ error: 'Could not load dashboard statistics.' }); }
  });

  app.get('/api/admin/servers', requireAdmin, async (req, res) => {
    try { res.json((await readServers()).map(withoutPassword)); }
    catch (error) { console.error('Could not read configured servers:', error.message); res.status(500).json({ error: 'Could not load configured servers.' }); }
  });

  app.post('/api/admin/servers/test', requireAdmin, async (req, res) => {
    const { host, port, password } = req.body || {};
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535 || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Enter an RCON hostname, port, and password.' });
    }
    try {
      const result = await sendRcon(normalizeHost(host), numericPort, password, 'serverinfo', {
        openTimeoutMs: 4_000,
        responseTimeoutMs: 2_500
      });
      res.json({ ok: true, message: result.response ? 'RCON connection succeeded and serverinfo replied.' : 'RCON accepted the connection; this server did not return a serverinfo reply.' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/servers', requireAdmin, async (req, res) => {
    const { name, host, port, password, region } = req.body || {};
    const numericPort = Number(port);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ error: 'Give this server a name (up to 80 characters).' });
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) return res.status(400).json({ error: 'Enter a valid RCON port.' });
    if (typeof password !== 'string' || !password || password.length > 512) return res.status(400).json({ error: 'Enter the RCON password for this server.' });
    let safeHost;
    try { safeHost = await assertPublicHost(host); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const servers = await readServers();
    if (servers.some(server => server.name.toLowerCase() === name.trim().toLowerCase())) return res.status(409).json({ error: 'A server with that name already exists.' });
    const server = {
      id: crypto.randomUUID(),
      name: name.trim(),
      region: String(region || '').trim().slice(0, 40),
      host: safeHost,
      port: numericPort,
      password,
      createdAt: new Date().toISOString()
    };
    servers.push(server);
    await writeJson(SERVER_FILE, servers);
    statusCache.delete(server.id);
    res.status(201).json(withoutPassword(server));
  });

  app.put('/api/admin/servers/:id', requireAdmin, async (req, res) => {
    const servers = await readServers();
    const index = servers.findIndex(server => server.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Server not found.' });
    const { name, host, port, password, region } = req.body || {};
    const current = servers[index];
    const numericPort = Number(port);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ error: 'Give this server a name (up to 80 characters).' });
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) return res.status(400).json({ error: 'Enter a valid RCON port.' });
    const nextPassword = typeof password === 'string' && password ? password : current.password;
    if (!nextPassword || nextPassword.length > 512) return res.status(400).json({ error: 'Enter an RCON password.' });
    let safeHost;
    try { safeHost = await assertPublicHost(host); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (servers.some(server => server.id !== current.id && server.name.toLowerCase() === name.trim().toLowerCase())) return res.status(409).json({ error: 'A server with that name already exists.' });
    servers[index] = {
      ...current,
      name: name.trim(),
      region: String(region || '').trim().slice(0, 40),
      host: safeHost,
      port: numericPort,
      password: nextPassword,
      updatedAt: new Date().toISOString()
    };
    await writeJson(SERVER_FILE, servers);
    statusCache.delete(current.id);
    res.json(withoutPassword(servers[index]));
  });

  app.delete('/api/admin/servers/:id', requireAdmin, async (req, res) => {
    const servers = await readServers();
    const next = servers.filter(server => server.id !== req.params.id);
    if (next.length === servers.length) return res.status(404).json({ error: 'Server not found.' });
    await writeJson(SERVER_FILE, next);
    statusCache.delete(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/admin/rcon', requireAdmin, async (req, res) => {
    const serverId = String(req.body?.serverId || '');
    const command = String(req.body?.command || '').trim();
    if (!command || command.length > 200 || /[\r\n\u0000-\u001f]/.test(command)) return res.status(400).json({ error: 'Enter one RCON command on a single line (maximum 200 characters).' });
    const server = (await readServers()).find(item => item.id === serverId);
    if (!server) return res.status(404).json({ error: 'Select a configured server first.' });
    try {
      const result = await sendRcon(server.host, server.port, server.password, command);
      const audit = await readJson(AUDIT_FILE, []);
      audit.push({ id: crypto.randomUUID(), serverId: server.id, serverName: server.name, userId: req.session.user.id, timestamp: new Date().toISOString() });
      await writeJson(AUDIT_FILE, audit.slice(-500));
      res.json({ ok: true, response: result.response || 'Command sent. The server did not return a response.' });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/admin/discord/channels', requireAdmin, async (req, res) => {
    try { res.json(await getGuildChannels(req.query.refresh === '1')); }
    catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });

  app.get('/api/admin/discord/messages', requireAdmin, async (req, res) => {
    const channelId = String(req.query.channelId || '');
    if (!/^\d{17,20}$/.test(channelId)) return res.status(400).json({ error: 'Select a Discord text channel.' });
    try { res.json(await getChannelMessages(channelId, Number(req.query.limit) || 30)); }
    catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });

  app.get('/api/admin/discord/overview', requireAdmin, async (req, res) => {
    try { res.json(await getOverview(req.query.refresh === '1')); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try { res.json(await readJson(SETTINGS_FILE, { activeClansChannelId: '', inviteChannelId: '', logsChannelId: '' })); }
    catch (error) { console.error('Could not read dashboard settings:', error.message); res.status(500).json({ error: 'Could not load channel settings.' }); }
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    const keys = ['activeClansChannelId', 'inviteChannelId', 'logsChannelId'];
    const settings = Object.fromEntries(keys.map(key => [key, String(req.body?.[key] || '')]));
    try {
      const channels = await getGuildChannels();
      const validIds = new Set(channels.map(channel => channel.id));
      if (keys.some(key => settings[key] && !validIds.has(settings[key]))) return res.status(400).json({ error: 'Choose channels from the configured VANDAL Discord server.' });
      await writeJson(SETTINGS_FILE, settings);
      res.json(settings);
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message });
    }
  });
}

module.exports = { createDashboardApi };
