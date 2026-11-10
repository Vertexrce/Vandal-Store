const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { rceRequest } = require('./rce-client');

function createClanApi(app, options) {
  const { DATA_DIR, GUILD_ID, requireLogin, requireAdmin, readAccounts, readProducts } = options;
  const imageDir = path.join(DATA_DIR, 'clan-images');
  const wrap = handler => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Clan API request failed:', error.message);
      res.status(error.status || 500).json({ error: error.message || 'Could not complete the clan request.' });
    }
  };

  function imageOrigin(req) {
    const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
    if (domain) return `https://${domain}`;
    return `${req.protocol}://${req.get('host')}`;
  }

  async function saveClanImage(req) {
    const dataUrl = String(req.body?.imageDataUrl || '');
    if (!dataUrl) return null;
    const match = dataUrl.match(/^data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw Object.assign(new Error('Choose a JPG, PNG, GIF, or WebP clan image.'), { status: 400 });
    const mime = match[1].toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 5 * 1024 * 1024) throw Object.assign(new Error('Clan images must be 5 MB or smaller.'), { status: 400 });
    const signatures = {
      jpeg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      gif: bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/),
      webp: bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    };
    if (!signatures[mime]) throw Object.assign(new Error('The selected file is not a valid image.'), { status: 400 });
    const extension = mime === 'jpeg' ? 'jpg' : mime;
    await fs.promises.mkdir(imageDir, { recursive: true, mode: 0o700 });
    const filename = `${crypto.randomUUID()}.${extension}`;
    await fs.promises.writeFile(path.join(imageDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    return { filename, url: `${imageOrigin(req)}/api/clan-images/${filename}` };
  }

  app.get('/api/clan-images/:filename', wrap(async (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/.test(filename)) return res.sendStatus(404);
    const file = path.join(imageDir, filename);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(file, error => {
      if (error && !res.headersSent) res.sendStatus(error.code === 'ENOENT' ? 404 : 500);
    });
  }));

  app.get('/api/clans/servers', wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const servers = await rceRequest(`/v1/clans/servers?guildId=${encodeURIComponent(GUILD_ID)}`);
    res.json(servers);
  }));

  app.get('/api/clans', wrap(async (req, res) => {
    const serverId = String(req.query.serverId || '');
    if (!serverId || serverId.length > 100) return res.status(400).json({ error: 'Choose a game server.' });
    const userId = req.session.user?.id || '';
    const result = await rceRequest(
      `/v1/clans?guildId=${encodeURIComponent(GUILD_ID)}&serverId=${encodeURIComponent(serverId)}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`
    );
    res.set('Cache-Control', 'no-store');
    res.json(result);
  }));

  app.get('/api/clans/:clanId', wrap(async (req, res) => {
    const clanId = String(req.params.clanId || '');
    const serverId = String(req.query.serverId || '');
    if (!/^\d+$/.test(clanId) || !serverId || serverId.length > 100) return res.status(400).json({ error: 'Choose a clan and game server.' });
    const userId = req.session.user?.id || '';
    const result = await rceRequest(
      `/v1/clans/${encodeURIComponent(clanId)}?guildId=${encodeURIComponent(GUILD_ID)}&serverId=${encodeURIComponent(serverId)}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`
    );
    res.json(result);
  }));

  app.post('/api/clans', requireLogin, wrap(async (req, res) => {
    const userId = req.session.user.id;
    const accounts = await readAccounts();
    const account = accounts[userId];
    if (!account?.gamertag) return res.status(403).json({ error: 'Link your Rust in-game name to your website account before creating or joining a clan.' });
    const serverId = String(req.body?.serverId || '').trim();
    if (!serverId || serverId.length > 100) return res.status(400).json({ error: 'Choose a game server.' });

    let image;
    try {
      image = await saveClanImage(req);
      const result = await rceRequest('/v1/clans', {
        method: 'POST',
        body: {
          guildId: GUILD_ID,
          serverId,
          ownerId: userId,
          name: req.body?.name,
          tag: req.body?.tag,
          color: req.body?.color,
          description: req.body?.description,
          imageUrl: image?.url || ''
        }
      });
      return res.status(201).json(result);
    } catch (error) {
      if (image?.filename) await fs.promises.unlink(path.join(imageDir, image.filename)).catch(() => {});
      throw error;
    }
  }));

  app.post('/api/clans/join', requireLogin, wrap(async (req, res) => {
    const userId = req.session.user.id;
    const accounts = await readAccounts();
    if (!accounts[userId]?.gamertag) return res.status(403).json({ error: 'Link your Rust in-game name to your website account before creating or joining a clan.' });
    const serverId = String(req.body?.serverId || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!serverId || serverId.length > 100 || !code || code.length > 32) return res.status(400).json({ error: 'Enter a valid clan invite code.' });
    const result = await rceRequest('/v1/clans/join', {
      method: 'POST',
      body: { guildId: GUILD_ID, serverId, userId, code }
    });
    res.json(result);
  }));

  app.post('/api/clans/:clanId/invites', requireLogin, wrap(async (req, res) => {
    const clanId = String(req.params.clanId || '');
    const serverId = String(req.body?.serverId || '').trim();
    if (!/^\d+$/.test(clanId) || !serverId) return res.status(400).json({ error: 'Choose a clan and game server.' });
    const result = await rceRequest(`/v1/clans/${encodeURIComponent(clanId)}/invites`, {
      method: 'POST',
      body: { guildId: GUILD_ID, serverId, userId: req.session.user.id }
    });
    res.status(201).json(result);
  }));

  app.get('/api/admin/linked-users', requireAdmin, wrap(async (_req, res) => {
    const accounts = await readAccounts();
    const linked = Object.entries(accounts)
      .filter(([, account]) => account && account.gamertag)
      .map(([discordId, account]) => ({
        discordId,
        discordUsername: account.discordUsername || 'Discord username not recorded',
        gamertag: account.gamertag,
        linkedAt: account.linkedAt || null,
        linkStatus: account.linkStatus || 'unverified'
      }))
      .sort((a, b) => String(a.gamertag).localeCompare(String(b.gamertag)));
    res.json(linked);
  }));

  app.get('/api/admin/kits', requireAdmin, wrap(async (_req, res) => {
    const products = (await readProducts()).filter(product => String(product.category).toLowerCase() === 'kits');
    const servers = await rceRequest(`/v1/clans/servers?guildId=${encodeURIComponent(GUILD_ID)}`);
    res.json({
      kits: products.map(product => ({
        id: product.id,
        name: product.name,
        gameKit: product.gameKit || '',
        price: product.price,
        description: product.description || ''
      })),
      servers
    });
  }));

  app.post('/api/admin/kits/give', requireAdmin, wrap(async (req, res) => {
    const productId = String(req.body?.productId || '');
    const serverId = String(req.body?.serverId || '');
    const gamertag = String(req.body?.gamertag || '').trim();
    const product = (await readProducts()).find(item => item.id === productId && String(item.category).toLowerCase() === 'kits');
    if (!product) return res.status(404).json({ error: 'That kit is not configured in the Store. Add it under Store → Kits first.' });
    if (!product.gameKit) return res.status(400).json({ error: 'This store kit has no RCE kit name. Recreate/configure it with its in-game kit name in the Store tab.' });
    if (!serverId || serverId.length > 100) return res.status(400).json({ error: 'Choose a game server.' });
    if (!/^[A-Za-z0-9 _.-]{2,32}$/.test(gamertag)) return res.status(400).json({ error: 'Enter an in-game username using letters, numbers, spaces, dots, underscores, or hyphens.' });
    const result = await rceRequest('/v1/kits/give', {
      method: 'POST',
      body: {
        guildId: GUILD_ID,
        serverId,
        kitName: product.gameKit,
        gamertag,
        actorId: req.session.user.id
      }
    });
    res.json(result);
  }));
}

module.exports = { createClanApi };
