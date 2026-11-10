const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'vandalrce.up.railway.app'}/auth/discord/callback`;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1565095830560575508';
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID || '1569519586166972497';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

if (!process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set. Set a long random value in Railway.');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(session({
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
    req.session.user = { id: user.id, username: user.global_name || user.username, discriminator: user.discriminator, avatar: user.avatar };
    req.session.isAdmin = false;
    if (BOT_TOKEN) {
      try { await refreshAdmin(req); }
      catch (e) { console.error('Initial role check failed:', e.message); }
    }
    req.session.save(() => res.redirect(req.session.isAdmin ? '/admin' : '/#home'));
  } catch (error) {
    console.error('Discord OAuth callback error:', error.message);
    res.status(500).send('Discord sign-in failed. Please return to VANDAL and try again.');
  }
});

app.post('/auth/logout', (req, res) => req.session.destroy(() => {
  res.clearCookie('vandal.sid');
  res.json({ ok: true });
}));
app.get('/api/me', async (req, res) => {
  if (!req.session.user) return res.json({ signedIn: false });
  let isAdmin = false;
  let roleCheckAvailable = Boolean(BOT_TOKEN);
  if (roleCheckAvailable) {
    try { isAdmin = await refreshAdmin(req); }
    catch (e) { roleCheckAvailable = false; console.error('Role check failed:', e.message); }
  }
  res.json({ signedIn: true, user: req.session.user, isAdmin, roleCheckAvailable });
});

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
  if (![name, category, price].every(v => typeof v === 'string' && v.trim()) || name.length > 80 || description?.length > 500) return res.status(400).json({ error: 'Name, category and price are required. Keep the description under 500 characters.' });
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
app.get('/admin', async (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/discord');
  try { if (!await refreshAdmin(req)) return res.status(403).send('Admin access requires the configured VANDAL Discord role. <a href="/#home">Return to VANDAL</a>'); }
  catch (e) { console.error('Admin page role check failed:', e.message); return res.status(503).send('Could not verify your Discord role. Please try again later.'); }
  res.sendFile(path.join(__dirname, 'admin.html'), err => { if (err) next(err); });
});
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`VANDAL website listening on ${PORT}`));
