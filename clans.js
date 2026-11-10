(() => {
  const $ = selector => document.querySelector(selector);
  const state = { servers: [], selectedServerId: '', clans: [], me: null, kits: [] };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#e4b33f';
  }

  function safeImage(value) {
    const url = String(value || '');
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function serverLabel(server) {
    const match = `${server.region || ''} ${server.name || ''}`.match(/\b(EU|AU)\s*(\d+(?:\.\d+)?\s*X)\b/i);
    return match ? `${match[1].toUpperCase()} ${match[2].replace(/\s+/g, '').toUpperCase()}` : server.name;
  }

  function setNotice(message = '', kind = '') {
    const node = $('#clan-notice');
    node.textContent = message;
    node.classList.toggle('error', kind === 'error');
    node.classList.toggle('success', kind === 'success');
  }

  function setFormNotice(selector, message = '', kind = '') {
    const node = $(selector);
    node.textContent = message;
    node.classList.toggle('error', kind === 'error');
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  }

  function openDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeDialog(dialogId) {
    document.getElementById(dialogId)?.close();
  }

  async function ensureLinkedAccount() {
    if (!state.me) {
      try { state.me = await request('/api/me'); }
      catch { state.me = { signedIn: false }; }
    }
    if (!state.me.signedIn) {
      location.href = '/auth/discord';
      return false;
    }
    if (!state.me.account?.gamertag) {
      setNotice('Link your Rust in-game name to your website account before creating or joining a clan.', 'error');
      const modal = $('#site-modal');
      $('#modal-title').textContent = 'LINK YOUR RUST ACCOUNT';
      $('#modal-copy').textContent = 'Enter the console gamertag you use in Rust.';
      $('#link-account-form').classList.remove('hidden');
      $('#discord-login-action').classList.add('hidden');
      $('#modal-footnote').textContent = 'Gamertag linking is saved to your Discord account.';
      $('#link-account-notice').textContent = '';
      if (modal && !modal.open) modal.showModal();
      else if (!modal) location.href = '/profile';
      return false;
    }
    return true;
  }

  function setEmpty(title, copy, visible = true) {
    $('#clan-empty-title').textContent = title;
    $('#clan-empty-copy').textContent = copy;
    $('.clans-page > .empty-state').classList.toggle('visible', visible);
  }

  function renderServers() {
    const tabs = $('#clan-server-tabs');
    tabs.replaceChildren();
    state.servers.forEach(server => {
      const button = document.createElement('button');
      button.className = `subtab${server.id === state.selectedServerId ? ' selected' : ''}`;
      button.type = 'button';
      button.textContent = `▤  ${serverLabel(server)}`;
      button.disabled = !server.clanConfigured;
      button.title = server.clanConfigured ? server.name : 'An admin must run /clan setup for this server first.';
      button.addEventListener('click', () => {
        if (!server.clanConfigured) return;
        state.selectedServerId = server.id;
        renderServers();
        loadClans();
      });
      tabs.append(button);
    });
  }

  function clanAvatar(clan) {
    const image = safeImage(clan.imageUrl);
    return image
      ? `<div class="clan-avatar"><img src="${escapeHtml(image)}" alt="${escapeHtml(clan.name)} clan image" loading="lazy"></div>`
      : '<div class="clan-avatar" aria-hidden="true">⬡</div>';
  }

  function renderClanCard(clan) {
    const color = safeColor(clan.color);
    return `<article class="clan-card" style="--clan-color:${color}">
      ${clanAvatar(clan)}
      <div class="clan-card-body">
        <h3>${escapeHtml(clan.name)} <span>[${escapeHtml(clan.tag)}]</span></h3>
        <p>${escapeHtml(clan.description || 'No description provided.')}</p>
        <div class="clan-card-meta"><span>♟ ${Number(clan.memberCount) || 0} members</span><span class="clan-owner">👑 ${escapeHtml(clan.ownerName || 'Clan owner')}</span></div>
        <button class="clan-view-btn" type="button" data-clan-details="${escapeHtml(clan.id)}">◉ &nbsp; VIEW DETAILS</button>
      </div>
    </article>`;
  }

  function renderMyClan(clan) {
    const mine = $('#my-clan-section');
    if (!clan) {
      mine.classList.add('hidden');
      mine.replaceChildren();
      return;
    }
    const isOwner = state.me?.user?.id === clan.ownerId;
    const kits = state.kits.length
      ? state.kits.map(kit => `<span class="clan-kit-chip">${escapeHtml(kit.name)}</span>`).join('')
      : '<span class="clan-kit-empty">No store kits configured yet.</span>';
    mine.innerHTML = `<article class="my-clan-card" style="--clan-color:${safeColor(clan.color)}">
      <div class="my-clan-title">${clanAvatar(clan)}<div>
        <h2>${escapeHtml(clan.name)} <span>[${escapeHtml(clan.tag)}]</span></h2>
        <p>${escapeHtml(clan.description || 'No description provided.')}</p>
        <div class="my-clan-badges"><span>♟ <b>${Number(clan.memberCount) || 0}</b> members</span><span>👑 ${isOwner ? 'Owner' : 'Member'}</span></div>
        <button class="clan-view-btn my-clan-action" type="button" data-clan-details="${escapeHtml(clan.id)}">◉ &nbsp; VIEW DETAILS</button>
      </div></div>
      <section class="clan-kit-section"><h3>⚒ CLAN KITS</h3><div class="clan-kit-list">${kits}</div></section>
    </article>`;
    mine.classList.remove('hidden');
  }

  function renderClans(data) {
    const clans = Array.isArray(data.clans) ? data.clans : [];
    state.clans = clans;
    $('#clan-count').textContent = `(${clans.length})`;
    $('#clan-grid').innerHTML = clans.map(renderClanCard).join('');
    const myClan = clans.find(clan => clan.id === data.myClanId) || clans.find(clan => clan.isMine);
    renderMyClan(myClan);
    if (clans.length) {
      setEmpty('', '', false);
      setNotice('');
    } else {
      setEmpty('No clans yet', 'Create the first clan on this server.');
    }
    $('#clan-open-create').disabled = !data.configured;
    $('#clan-open-join').disabled = !data.configured;
  }

  async function loadClans() {
    const server = state.servers.find(item => item.id === state.selectedServerId);
    if (!server) {
      setEmpty('No game servers available', 'The RCE bot has no registered game servers yet.');
      return;
    }
    if (!server.clanConfigured) {
      state.clans = [];
      $('#clan-grid').replaceChildren();
      $('#clan-count').textContent = '(0)';
      renderMyClan(null);
      $('#clan-open-create').disabled = true;
      $('#clan-open-join').disabled = true;
      setEmpty('Clan setup required', 'An admin must run /clan setup in Discord for this game server.');
      return;
    }
    setEmpty('Loading clans…', 'Reading the active clans from the RCE bot.');
    try {
      const data = await request(`/api/clans?serverId=${encodeURIComponent(server.id)}`);
      if (!data.configured) {
        setEmpty('Clan setup required', 'An admin must run /clan setup in Discord for this game server.');
        return;
      }
      renderClans(data);
    } catch (error) {
      setEmpty('Clans unavailable', error.message);
      setNotice(error.message, 'error');
    }
  }

  async function loadKitNames() {
    try {
      const products = await request('/api/products');
      state.kits = products.filter(product => String(product.category || '').toLowerCase() === 'kits' && product.gameKit);
    } catch {
      state.kits = [];
    }
  }

  async function loadServers() {
    try {
      const servers = await request('/api/clans/servers');
      state.servers = Array.isArray(servers) ? servers : [];
      const preferred = state.servers.find(server => server.clanConfigured && /EU\s*2X/i.test(`${server.region} ${server.name}`));
      state.selectedServerId = preferred?.id || state.servers.find(server => server.clanConfigured)?.id || state.servers[0]?.id || '';
      renderServers();
      await loadClans();
    } catch (error) {
      setEmpty('Clan connection unavailable', error.message);
      setNotice(error.message, 'error');
    }
  }

  async function loadDetails(clanId) {
    const serverId = state.selectedServerId;
    if (!serverId) return;
    const content = $('#clan-details-content');
    content.innerHTML = '<div class="empty">Loading clan details…</div>';
    openDialog('clan-details-dialog');
    try {
      const clan = await request(`/api/clans/${encodeURIComponent(clanId)}?serverId=${encodeURIComponent(serverId)}`);
      const members = (clan.members || []).map(member => `
        <div class="clan-detail-member">♟ ${escapeHtml(member.name)} <span>${escapeHtml(member.role)}</span></div>
      `).join('');
      const inviteButton = clan.canManage
        ? `<button class="clan-detail-invite" type="button" data-create-invite="${escapeHtml(clan.id)}">${clan.invite ? '↗  View Invite Code' : '＋  Create Invite Code'}</button>`
        : '';
      const inviteBlock = clan.invite
        ? `<div class="clan-detail-code" title="Click to copy">${escapeHtml(clan.invite.code)}</div><p class="clan-kit-empty">This code works on the website Join Clan button and Discord with <b>/clan join</b> for ${escapeHtml(state.servers.find(s => s.id === serverId)?.name || 'this server')}.</p>`
        : '';
      const kits = state.kits.length
        ? state.kits.map(kit => `<span class="clan-kit-chip">${escapeHtml(kit.name)}</span>`).join('')
        : '<p>No store kits configured yet.</p>';
      content.innerHTML = `<div class="clan-detail-heading" style="--clan-color:${safeColor(clan.color)}">
        ${clanAvatar(clan)}<div><h2>${escapeHtml(clan.name)} <span style="color:#f2b81f">[${escapeHtml(clan.tag)}]</span></h2><p>${escapeHtml(clan.description || 'No description provided.')}</p></div>
      </div>
      <div class="my-clan-badges"><span>♟ ${Number(clan.memberCount) || 0} members</span><span>👑 ${escapeHtml(clan.ownerName || 'Owner')}</span></div>
      ${inviteButton}${inviteBlock}
      <section class="clan-detail-members"><h3>MEMBERS (${Number(clan.memberCount) || 0})</h3>${members || '<p class="clan-kit-empty">No member list available.</p>'}</section>
      <section class="clan-detail-kits"><h3>CLAN KITS</h3><div class="clan-kit-list">${kits}</div></section>`;
    } catch (error) {
      content.innerHTML = `<p class="form-notice error">${escapeHtml(error.message)}</p>`;
    }
  }

  $('#clan-open-join').addEventListener('click', async () => {
    if (!await ensureLinkedAccount()) return;
    if (!state.selectedServerId) return setNotice('Select a configured game server first.', 'error');
    $('#clan-invite-code').value = '';
    setFormNotice('#clan-join-notice');
    openDialog('clan-join-dialog');
  });

  $('#clan-open-create').addEventListener('click', async () => {
    if (!await ensureLinkedAccount()) return;
    if (!state.selectedServerId) return setNotice('Select a configured game server first.', 'error');
    $('#clan-create-form').reset();
    $('#clan-create-form').elements.color.value = 'blue';
    setFormNotice('#clan-create-notice');
    openDialog('clan-create-dialog');
  });

  $('#clan-join-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!await ensureLinkedAccount()) return;
    const button = event.currentTarget.querySelector('button[type=submit]');
    button.disabled = true;
    setFormNotice('#clan-join-notice', 'Joining clan…');
    try {
      const result = await request('/api/clans/join', {
        method: 'POST',
        body: JSON.stringify({ serverId: state.selectedServerId, code: $('#clan-invite-code').value })
      });
      closeDialog('clan-join-dialog');
      setNotice(`Joined [${result.tag}] ${result.name}.`, 'success');
      await loadClans();
    } catch (error) {
      setFormNotice('#clan-join-notice', error.message, 'error');
    } finally { button.disabled = false; }
  });

  $('#clan-create-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!await ensureLinkedAccount()) return;
    const form = event.currentTarget;
    const submit = form.querySelector('button[type=submit]');
    const imageFile = $('#clan-image').files[0];
    if (imageFile && imageFile.size > 5 * 1024 * 1024) {
      return setFormNotice('#clan-create-notice', 'Clan images must be 5 MB or smaller.', 'error');
    }
    submit.disabled = true;
    setFormNotice('#clan-create-notice', 'Creating clan and Discord assets…');
    try {
      let imageDataUrl = '';
      if (imageFile) {
        imageDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read the selected image.'));
          reader.readAsDataURL(imageFile);
        });
      }
      const formData = new FormData(form);
      const result = await request('/api/clans', {
        method: 'POST',
        body: JSON.stringify({
          serverId: state.selectedServerId,
          name: formData.get('name'),
          tag: formData.get('tag'),
          color: formData.get('color'),
          description: formData.get('description'),
          imageDataUrl
        })
      });
      closeDialog('clan-create-dialog');
      setNotice(`[${result.tag}] ${result.name} was created. The bot has updated the active-clans panel.`, 'success');
      await loadClans();
    } catch (error) {
      setFormNotice('#clan-create-notice', error.message, 'error');
    } finally { submit.disabled = false; }
  });

  document.addEventListener('click', async event => {
    const close = event.target.closest('[data-close-dialog]');
    if (close) closeDialog(close.dataset.closeDialog);
    const details = event.target.closest('[data-clan-details]');
    if (details) await loadDetails(details.dataset.clanDetails);
    const makeInvite = event.target.closest('[data-create-invite]');
    if (makeInvite) {
      makeInvite.disabled = true;
      makeInvite.textContent = 'Creating…';
      try {
        await request(`/api/clans/${encodeURIComponent(makeInvite.dataset.createInvite)}/invites`, {
          method: 'POST',
          body: JSON.stringify({ serverId: state.selectedServerId })
        });
        await loadDetails(makeInvite.dataset.createInvite);
      } catch (error) {
        makeInvite.disabled = false;
        makeInvite.textContent = error.message;
      }
    }
    const code = event.target.closest('.clan-detail-code');
    if (code) {
      try {
        await navigator.clipboard.writeText(code.textContent);
        code.title = 'Copied!';
      } catch {}
    }
  });

  document.querySelectorAll('.clan-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });

  (async () => {
    try { state.me = await request('/api/me'); }
    catch { state.me = { signedIn: false }; }
    await Promise.all([loadKitNames(), loadServers()]);
  })();
})();
