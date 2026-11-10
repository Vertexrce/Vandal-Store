const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'vandalrce.up.railway.app'}/auth/discord/callback`;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1565095830560575508';
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID || '1569519586166972497';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');


// Persist Express sessions on the Railway volume so logins survive restarts.
class PersistentFileStore extends session.Store {
  constructor(directory) {
    super();
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.reaper = setInterval(() => this.reapExpired(), 60 * 60 * 1000);
    this.reaper.unref?.();
  }

  fileFor(sessionId) {
    const id = crypto.createHash('sha256').update(sessionId).digest('hex');
    return path.join(this.directory, `${id}.json`);
  }

  get(sessionId, callback) {
    const done = typeof callback === 'function' ? callback : () => {};
    const file = this.fileFor(sessionId);
    fs.readFile(file, 'utf8', (error, contents) => {
      if (error) return done(error.code === 'ENOENT' ? null : error, null);
      let stored;
      try { stored = JSON.parse(contents); }
      catch (parseError) { return done(parseError, null); }
      const expiresAt = stored.cookie?.expires ? Date.parse(stored.cookie.expires) : null;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return fs.unlink(file, unlinkError => done(unlinkError && unlinkError.code !== 'ENOENT' ? unlinkError : null, null));
      }
      done(null, stored);
    });
  }

  set(sessionId, stored, callback) {
    const done = typeof callback === 'function' ? callback : () => {};
    const file = this.fileFor(sessionId);
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    fs.writeFile(temporary, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 }, error => {
      if (error) return done(error);
      fs.rename(temporary, file, renameError => {
        if (renameError) return fs.unlink(temporary, () => done(renameError));
        done(null);
      });
    });
  }

  touch(sessionId, stored, callback) {
    this.set(sessionId, stored, callback);
  }

  destroy(sessionId, callback) {
    const done = typeof callback === 'function' ? callback : () => {};
    fs.unlink(this.fileFor(sessionId), error => done(error && error.code !== 'ENOENT' ? error : null));
  }

  reapExpired() {
    fs.readdir(this.directory, (error, files) => {
      if (error) return;
      const now = Date.now();
      for (const name of files) {
        if (!name.endsWith('.json')) continue;
        const file = path.join(this.directory, name);
        fs.readFile(file, 'utf8', (readError, contents) => {
          if (readError) return;
          try {
            const stored = JSON.parse(contents);
            const expiresAt = stored.cookie?.expires ? Date.parse(stored.cookie.expires) : null;
            if (Number.isFinite(expiresAt) && expiresAt <= now) fs.unlink(file, () => {});
          } catch {
            fs.unlink(file, () => {});
          }
        });
      }
    });
  }
}

const sessionStore = new PersistentFileStore(path.join(DATA_DIR, 'sessions'));

if (!process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set. Set a long random value in Railway.');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(session({
  store: sessionStore,
  name: 'vandal.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: 'auto', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in with Discord first.' });
  next();
}
async function getGuildMember(userId) {
  if (!BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is not configured');
  const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord member lookup failed (${response.status})`);
  return response.json();
}
async function refreshAdmin(req) {
  if (!req.session.user) return false;
  const member = await getGuildMember(req.session.user.id);
  req.session.isAdmin = Boolean(member && Array.isArray(member.roles) && member.roles.includes(ADMIN_ROLE_ID));
  return req.session.isAdmin;
}
async function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Sign in with Discord to continue.' });
  try {
    const allowed = await refreshAdmin(req);
    if (!allowed) return res.status(403).json({ error: 'Admin access requires the VANDAL admin role in the VANDAL Discord server.' });
    next();
  } catch (error) {
    console.error('Admin role check failed:', error.message);
    res.status(503).json({ error: 'Could not verify your Discord role. Please try again later.' });
  }
}

app.get('/auth/discord', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(503).send('Discord OAuth is not configured. Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in Railway.');
  const state = require('crypto').randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send('Discord login could not be verified. Please try signing in again.');
    delete req.session.oauthState;
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || 'Discord token exchange failed');
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const user = await userResponse.json();
    if (!userResponse.ok) throw new Error('Could not retrieve your Discord profile');
    req.session.user = { id: user.id, username: user.global_name || user.username, discordUsername: user.username, discriminator: user.discriminator, avatar: user.avatar, createdAt: new Date(Number((BigInt(user.id) >> 22n) + 1420070400000n)).toISOString() };
    req.session.isAdmin = false;
    if (BOT_TOKEN) {
      try { await refreshAdmin(req); }
      catch (e) { console.error('Initial role check failed:', e.message); }
    }
    // All accounts land on the public homepage after OAuth. Admin access is
    // still verified server-side and the dashboard link appears for staff.
    req.session.save(() => res.redirect('/#home'));
  } catch (error) {
    console.error('Discord OAuth callback error:', error.message);
    res.status(500).send('Discord sign-in failed. Please return to VANDAL and try again.');
  }
});

app.post('/auth/logout', (req, res) => req.session.destroy(() => {
  res.clearCookie('vandal.sid');
  res.json({ ok: true });
}));
async function readAccounts() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  try { return JSON.parse(await fs.promises.readFile(ACCOUNTS_FILE, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function writeAccounts(accounts) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}
app.get('/api/me', async (req, res) => {
  if (!req.session.user) return res.json({ signedIn: false });
  let isAdmin = false;
  let roleCheckAvailable = Boolean(BOT_TOKEN);
  if (roleCheckAvailable) {
    try { isAdmin = await refreshAdmin(req); }
    catch (e) { roleCheckAvailable = false; console.error('Role check failed:', e.message); }
  }
  const accounts = await readAccounts();
  const account = accounts[req.session.user.id] || {};
  res.json({ signedIn: true, user: req.session.user, account, displayName: account.gamertag || req.session.user.username, isAdmin, roleCheckAvailable });
});
app.post('/api/account/link', requireLogin, async (req, res) => {
  const gamertag = String(req.body?.gamertag || '').trim();
  if (gamertag.length < 2 || gamertag.length > 32 || !/^[a-zA-Z0-9 _.-]+$/.test(gamertag)) {
    return res.status(400).json({ error: 'Enter a gamertag between 2 and 32 characters using letters, numbers, spaces, dots, underscores or hyphens.' });
  }
  const accounts = await readAccounts();
  const normalized = gamertag.toLowerCase();
  const alreadyUsed = Object.entries(accounts).some(([id, account]) => id !== req.session.user.id && account.gamertag && account.gamertag.toLowerCase() === normalized);
  if (alreadyUsed) return res.status(409).json({ error: 'That gamertag is already linked to another website account.' });
  accounts[req.session.user.id] = { ...(accounts[req.session.user.id] || {}), gamertag, linkedAt: new Date().toISOString(), linkStatus: 'unverified' };
  await writeAccounts(accounts);
  res.json({ ok: true, account: accounts[req.session.user.id], displayName: gamertag, verification: 'unverified' });
});
app.delete('/api/account/link', requireLogin, async (req, res) => {
  const accounts = await readAccounts();
  delete accounts[req.session.user.id];
  await writeAccounts(accounts);
  res.json({ ok: true });
});
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));

async function readProducts() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  try { return JSON.parse(await fs.promises.readFile(PRODUCTS_FILE, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function writeProducts(products) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}
app.get('/api/admin/products', requireAdmin, async (req, res) => res.json(await readProducts()));
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { name, category, price, description } = req.body || {};
  if (![name, category, price].every(v => typeof v === 'string' && v.trim()) || name.length > 80 || description?.length > 500 || !['VIP', 'Packs', 'Kits'].includes(category)) return res.status(400).json({ error: 'Enter a name, one of the supported categories, and a price. Keep the description under 500 characters.' });
  const products = await readProducts();
  const product = { id: require('crypto').randomUUID(), name: name.trim(), category: category.trim(), price: price.trim(), description: String(description || '').trim(), createdAt: new Date().toISOString() };
  products.push(product); await writeProducts(products); res.status(201).json(product);
});
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const products = await readProducts();
  const next = products.filter(p => p.id !== req.params.id);
  if (next.length === products.length) return res.status(404).json({ error: 'Product not found.' });
  await writeProducts(next); res.json({ ok: true });
});

const { createDashboardApi } = require('./dashboard-api');
createDashboardApi(app, {
  DATA_DIR,
  GUILD_ID,
  ADMIN_ROLE_ID,
  BOT_TOKEN,
  requireAdmin,
  readProducts
});

app.get('/admin', async (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/discord');
  try { if (!await refreshAdmin(req)) return res.status(403).send('Admin access requires the configured VANDAL Discord role. <a href="/#home">Return to VANDAL</a>'); }
  catch (e) { console.error('Admin page role check failed:', e.message); return res.status(503).send('Could not verify your Discord role. Please try again later.'); }
  res.sendFile(path.join(__dirname, 'admin.html'), err => { if (err) next(err); });
});
app.use((req, res, next) => {
  const privateFiles = new Set(['server.js', 'bot.js', 'dashboard-api.js']);
  if (privateFiles.has(path.basename(req.path)) || req.path === '/data' || req.path.startsWith('/data/')) {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const { startDiscordBot } = require('./bot');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VANDAL website listening on ${PORT}`);
  // Run the website and Discord bot in the same Railway service/process.
  startDiscordBot(BOT_TOKEN).catch(error => {
    console.error('[VANDAL BOT] Startup error:', error.message);
  });
});
