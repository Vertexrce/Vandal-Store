const $ = selector => document.querySelector(selector);
const state = { me: null, servers: [], channels: [], settings: {} };

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function setNotice(selector, message, kind = '') {
  const node = $(selector);
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('error', kind === 'error');
  node.classList.toggle('success', kind === 'success');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : 'Unavailable';
}

function openTab(name) {
  document.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === name));
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('selected', button.dataset.tab === name));
  $('#sidebar').classList.remove('open');
  $('#mobile-menu').setAttribute('aria-expanded', 'false');
  if (name === 'discord') loadDiscordOverview();
  if (name === 'clans') loadClanActivity();
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.tab)));
document.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.openTab)));
$('#mobile-menu').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#mobile-menu').setAttribute('aria-expanded', String(open));
});

function renderProducts(products) {
  $('#product-count').textContent = products.length.toLocaleString();
  $('#product-list').innerHTML = products.length ? products.map(product => `
    <div class="list-item">
      <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${escapeHtml(product.price)}${product.description ? ` · ${escapeHtml(product.description)}` : ''}</small></div>
      <button class="btn danger" type="button" data-delete-product="${escapeHtml(product.id)}">DELETE</button>
    </div>`).join('') : '<div class="empty">No products yet. Add a product above.</div>';
  $('#product-list').querySelectorAll('[data-delete-product]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this store product?')) return;
    try {
      await api(`/api/admin/products/${encodeURIComponent(button.dataset.deleteProduct)}`, { method: 'DELETE' });
      setNotice('#store-notice', 'Product deleted.', 'success');
      await loadProducts();
      await loadOverview(true);
    } catch (error) { setNotice('#store-notice', error.message, 'error'); }
  }));
}

async function loadProducts() {
  const products = await api('/api/admin/products');
  renderProducts(products);
}

$('#product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  setNotice('#store-notice', 'Saving product…');
  try {
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    setNotice('#store-notice', 'Product added.', 'success');
    await loadProducts();
    await loadOverview(true);
  } catch (error) { setNotice('#store-notice', error.message, 'error'); }
});

function renderServers(servers) {
  state.servers = servers;
  $('#server-list').innerHTML = servers.length ? servers.map(server => `
    <article class="server-card">
      <div class="server-card-top"><div><h3>${escapeHtml(server.name)}</h3><p>${escapeHtml(server.region || 'Region not set')} · ${escapeHtml(server.host)}:${escapeHtml(server.port)} · RCON password ${server.passwordConfigured ? 'saved' : 'missing'}</p></div><span class="tag">CONFIGURED</span></div>
      <div class="button-row"><button class="btn secondary" type="button" data-edit-server="${escapeHtml(server.id)}">EDIT</button><button class="btn danger" type="button" data-delete-server="${escapeHtml(server.id)}">DELETE</button></div>
    </article>`).join('') : '<div class="empty">No servers configured yet. Add your game server above.</div>';

  const selector = $('#rcon-server');
  const previous = selector.value;
  selector.innerHTML = servers.length
    ? servers.map(server => `<option value="${escapeHtml(server.id)}">${escapeHtml(server.name)}</option>`).join('')
    : '<option value="">No configured servers</option>';
  if (servers.some(server => server.id === previous)) selector.value = previous;

  $('#server-list').querySelectorAll('[data-edit-server]').forEach(button => button.addEventListener('click', () => {
    const server = state.servers.find(item => item.id === button.dataset.editServer);
    if (!server) return;
    const form = $('#server-form');
    form.elements.id.value = server.id;
    form.elements.name.value = server.name;
    form.elements.region.value = server.region || '';
    form.elements.host.value = server.host;
    form.elements.port.value = server.port;
    form.elements.password.value = '';
    form.elements.password.placeholder = 'Blank keeps the current password';
    $('#server-notice').textContent = `Editing ${server.name}.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  $('#server-list').querySelectorAll('[data-delete-server]').forEach(button => button.addEventListener('click', async () => {
    const server = state.servers.find(item => item.id === button.dataset.deleteServer);
    if (!server || !confirm(`Remove ${server.name} from the website? This does not delete the game server.`)) return;
    try {
      await api(`/api/admin/servers/${encodeURIComponent(server.id)}`, { method: 'DELETE' });
      setNotice('#server-notice', 'Server removed from the website.', 'success');
      await loadServers();
      await loadOverview();
    } catch (error) { setNotice('#server-notice', error.message, 'error'); }
  }));
}

async function loadServers() {
  const servers = await api('/api/admin/servers');
  renderServers(servers);
}

function clearServerForm() {
  $('#server-form').reset();
  $('#server-form').elements.id.value = '';
  $('#server-password').placeholder = 'Stored privately on the server';
  setNotice('#server-notice', '');
}
$('#cancel-server-edit').addEventListener('click', clearServerForm);

$('#test-server').addEventListener('click', async () => {
  const form = $('#server-form');
  const data = Object.fromEntries(new FormData(form));
  if (!data.password) {
    setNotice('#server-notice', 'Enter the RCON password to test this connection.', 'error');
    return;
  }
  setNotice('#server-notice', 'Testing RCON connection…');
  try {
    const result = await api('/api/admin/servers/test', { method: 'POST', body: JSON.stringify(data) });
    setNotice('#server-notice', result.message, 'success');
  } catch (error) { setNotice('#server-notice', error.message, 'error'); }
});

$('#server-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const id = data.id;
  delete data.id;
  setNotice('#server-notice', 'Saving server configuration…');
  try {
    await api(id ? `/api/admin/servers/${encodeURIComponent(id)}` : '/api/admin/servers', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    clearServerForm();
    setNotice('#server-notice', 'Server saved. Public population and queue status will update automatically.', 'success');
    await loadServers();
    await loadOverview();
  } catch (error) { setNotice('#server-notice', error.message, 'error'); }
});

document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  $('#rcon-command').value = button.dataset.command;
}));

$('#run-rcon').addEventListener('click', async () => {
  const serverId = $('#rcon-server').value;
  const command = $('#rcon-command').value.trim();
  const server = state.servers.find(item => item.id === serverId);
  if (!server) return setNotice('#rcon-notice', 'Configure and select a server first.', 'error');
  if (!command) return setNotice('#rcon-notice', 'Enter a command first.', 'error');
  if (!confirm(`Send this RCON command to ${server.name}?\n\n${command}\n\nRCON commands can change the game server.`)) return;
  setNotice('#rcon-notice', 'Sending command…');
  $('#run-rcon').disabled = true;
  try {
    const result = await api('/api/admin/rcon', { method: 'POST', body: JSON.stringify({ serverId, command }) });
    $('#rcon-output').textContent = `> ${command}\n${result.response || 'Command sent.'}`;
    setNotice('#rcon-notice', 'Command sent.', 'success');
  } catch (error) {
    $('#rcon-output').textContent = `> ${command}\nError: ${error.message}`;
    setNotice('#rcon-notice', error.message, 'error');
  } finally { $('#run-rcon').disabled = false; }
});

function channelOptions(channels, selectedId, placeholder) {
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
  for (const channel of channels) {
    options.push(`<option value="${escapeHtml(channel.id)}"${channel.id === selectedId ? ' selected' : ''}>#${escapeHtml(channel.name)}</option>`);
  }
  return options.join('');
}

async function loadChannelsAndSettings() {
  try {
    const [channels, settings] = await Promise.all([
      api('/api/admin/discord/channels'),
      api('/api/admin/settings')
    ]);
    state.channels = channels;
    state.settings = settings;
    $('#discord-log-channel').innerHTML = channelOptions(channels, settings.logsChannelId, 'Choose a log channel');
    $('#active-clans-channel').innerHTML = channelOptions(channels, settings.activeClansChannelId, 'Choose active-clans channel');
    $('#invite-channel').innerHTML = channelOptions(channels, settings.inviteChannelId, 'Choose invite channel');
    $('#clan-logs-channel').innerHTML = channelOptions(channels, settings.logsChannelId, 'Choose clan logs channel');
  } catch (error) {
    setNotice('#discord-notice', `${error.message} Check that the bot is in the server and can view its channels.`, 'error');
    setNotice('#clan-notice', error.message, 'error');
  }
}

async function loadDiscordOverview(force = false) {
  try {
    const overview = await api(`/api/admin/discord/overview${force ? '?refresh=1' : ''}`);
    $('#discord-member-count').textContent = formatCount(overview.memberCount);
    $('#discord-online-count').textContent = formatCount(overview.onlineDiscordUsers);
    $('#discord-staff-count').textContent = formatCount(overview.staffCount);
    $('#discord-connection').textContent = overview.discordConnected ? 'Connected' : 'Unavailable';
    $('#discord-connection').className = overview.discordConnected ? 'good' : 'muted';
    if (!overview.discordConnected || overview.discordError) setNotice('#discord-notice', overview.discordError || 'Discord counts could not be retrieved.', 'error');
  } catch (error) {
    $('#discord-connection').textContent = 'Unavailable';
    setNotice('#discord-notice', error.message, 'error');
  }
}

function renderMessages(selector, messages) {
  const feed = $(selector);
  if (!messages.length) {
    feed.innerHTML = '<div class="empty">No recent messages found in this channel.</div>';
    return;
  }
  feed.innerHTML = messages.map(message => {
    const embedHtml = (message.embeds || []).map(embed => `
      <div class="embed">
        ${embed.title ? `<strong>${escapeHtml(embed.title)}</strong>` : ''}
        ${embed.description ? `<p>${escapeHtml(embed.description)}</p>` : ''}
        ${(embed.fields || []).map(field => `<div class="embed-field"><b>${escapeHtml(field.name)}</b><div>${escapeHtml(field.value)}</div></div>`).join('')}
      </div>`).join('');
    const body = message.content ? `<div class="message-body">${escapeHtml(message.content)}</div>` : '';
    return `<article class="message"><div class="message-head"><strong>${escapeHtml(message.author)}</strong><time>${escapeHtml(new Date(message.timestamp).toLocaleString())}</time></div>${body}${embedHtml || '<div class="message-body muted">No message text.</div>'}</article>`;
  }).join('');
}

async function loadMessages(channelId, selector) {
  if (!channelId) {
    $(selector).innerHTML = '<div class="empty">Choose a channel above.</div>';
    return;
  }
  const messages = await api(`/api/admin/discord/messages?channelId=${encodeURIComponent(channelId)}&limit=30`);
  renderMessages(selector, messages);
}

$('#load-discord-messages').addEventListener('click', async () => {
  setNotice('#discord-notice', 'Loading recent Discord messages…');
  try {
    await loadMessages($('#discord-log-channel').value, '#discord-messages');
    setNotice('#discord-notice', 'Recent messages loaded.', 'success');
  } catch (error) { setNotice('#discord-notice', error.message, 'error'); }
});

$('#discord-log-channel').addEventListener('change', () => {
  const channelId = $('#discord-log-channel').value;
  if (channelId) $('#load-discord-messages').click();
});

$('#refresh-discord').addEventListener('click', async () => {
  setNotice('#discord-notice', 'Refreshing Discord data…');
  await Promise.all([loadDiscordOverview(true), loadChannelsAndSettings()]);
  if ($('#discord-log-channel').value) $('#load-discord-messages').click();
});

$('#save-clan-channels').addEventListener('click', async () => {
  const settings = {
    activeClansChannelId: $('#active-clans-channel').value,
    inviteChannelId: $('#invite-channel').value,
    logsChannelId: $('#clan-logs-channel').value
  };
  setNotice('#clan-notice', 'Saving clan channel settings…');
  try {
    state.settings = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
    $('#discord-log-channel').value = state.settings.logsChannelId || '';
    setNotice('#clan-notice', 'Clan channels saved.', 'success');
    await loadClanActivity();
  } catch (error) { setNotice('#clan-notice', error.message, 'error'); }
});

async function loadClanActivity() {
  const entries = [
    [state.settings.activeClansChannelId || $('#active-clans-channel').value, '#active-clans-feed'],
    [state.settings.inviteChannelId || $('#invite-channel').value, '#invite-feed'],
    [state.settings.logsChannelId || $('#clan-logs-channel').value, '#clan-logs-feed']
  ];
  try {
    await Promise.all(entries.map(async ([channelId, selector]) => {
      await loadMessages(channelId, selector);
    }));
    setNotice('#clan-notice', 'Channel activity refreshed.', 'success');
  } catch (error) { setNotice('#clan-notice', error.message, 'error'); }
}

$('#refresh-clans').addEventListener('click', loadClanActivity);

function renderHomeServers(servers) {
  const box = $('#home-servers');
  if (!servers.length) {
    box.innerHTML = '<div class="empty">No game servers configured. Add one in RCON &amp; Servers to show live players and queue here.</div>';
    $('#players-online').textContent = '—';
    return;
  }
  const totalPlayers = servers.reduce((sum, server) => sum + (Number.isFinite(server.playerCount) ? server.playerCount : 0), 0);
  const anyKnown = servers.some(server => Number.isFinite(server.playerCount));
  $('#players-online').textContent = anyKnown ? totalPlayers.toLocaleString() : 'Unavailable';
  box.innerHTML = servers.map(server => `
    <article class="server-card">
      <div class="server-card-top"><div><h3>${escapeHtml(server.name)}</h3><p>${escapeHtml(server.region || 'Region not set')} · Players ${server.playerCount ?? '—'}${server.maxPlayers !== null ? `/${server.maxPlayers}` : ''} · Queue ${server.queue ?? '—'}</p></div>
      <span class="tag ${server.online ? 'online' : ''}">${server.online ? 'ONLINE' : 'OFFLINE'}</span></div>
    </article>`).join('');
}

async function loadOverview(force = false) {
  const overview = await api(`/api/admin/overview${force ? '?refresh=1' : ''}`);
  $('#guild-name').textContent = overview.guildName || 'VANDAL';
  $('#product-count').textContent = formatCount(overview.productsCount);
  $('#member-count').textContent = formatCount(overview.memberCount);
  $('#staff-count').textContent = formatCount(overview.staffCount);
  $('#discord-online').textContent = formatCount(overview.onlineDiscordUsers);
  $('#overview-note').textContent = overview.discordError
    ? `Discord data issue: ${overview.discordError}. Counts are approximate where available.`
    : 'Discord member and presence counts are approximate values returned by Discord.';
  const servers = await api('/api/servers');
  renderHomeServers(servers);
}

async function boot() {
  try {
    const me = await api('/api/me');
    if (!me.signedIn) {
      location.href = '/auth/discord';
      return;
    }
    if (!me.isAdmin) {
      $('#profile').textContent = `Signed in as ${me.user.username} · access not verified`;
      $('#admin-access').textContent = 'Not verified';
      setNotice('#overview-note', 'Admin role access could not be verified. Return to the public site and contact a server admin.');
      return;
    }
    state.me = me;
    $('#welcome-name').textContent = me.user.username || 'Discord user';
    $('#profile').textContent = `Signed in as ${me.user.username}`;
    await Promise.allSettled([
      loadOverview(),
      loadProducts(),
      loadServers(),
      loadChannelsAndSettings()
    ]);
    setInterval(() => loadOverview().catch(() => {}), 30_000);
  } catch (error) {
    $('#profile').textContent = 'Could not verify Discord access';
    setNotice('#overview-note', error.message, 'error');
  }
}

boot();
