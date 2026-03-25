/**
 * Contacts page — i18n v2
 */
import { state, openChat, avatarEl, showToast } from '../app.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

export function renderContacts(root) {
  root.innerHTML = `
    <div class="topbar">
      <div style="min-width:44px"></div>
      <div class="topbar-title">${t('contactsTitle')}</div>
      <button class="topbar-btn topbar-action" id="add-btn" title="${t('add')}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </button>
    </div>
    <div class="search-wrap">
      <input class="search-input" id="contact-search" placeholder="${t('searchUsers')}">
    </div>
    <div id="contact-list"></div>
    <div id="search-results" class="hidden"></div>
  `;

  const listEl = root.querySelector('#contact-list');
  const resultsEl = root.querySelector('#search-results');
  const searchInput = root.querySelector('#contact-search');

  // ── Friend requests ─────────────────────────────────────────────
  async function loadRequests() {
    try {
      const reqs = await api.friendRequests();
      if (!reqs.length) return;
      const sec = document.createElement('div');
      sec.innerHTML = `
        <div class="section-header">${t('friendRequests')} <span style="color:var(--red)">(${reqs.length})</span></div>`;
      reqs.forEach(r => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const av = avatarEl(r.nickname || r.username, r.avatar, 'avatar-sm');
        item.appendChild(av);
        const info = document.createElement('div');
        info.className = 'flex-1';
        info.innerHTML = `
          <div style="font-size:15px;font-weight:500">${esc(r.nickname || r.username)}</div>
          <div class="text-muted" style="font-size:13px">@${esc(r.username)}</div>`;
        item.appendChild(info);
        const btn = document.createElement('button');
        btn.className = 'btn-pill btn-green';
        btn.textContent = t('accept');
        btn.onclick = async e => {
          e.stopPropagation();
          try {
            await api.acceptFriend(r.id);
            state.contacts = await api.friends();
            showToast(t('friendAdded'));
            item.remove();
          } catch { showToast(t('opFail')); }
        };
        item.appendChild(btn);
        sec.appendChild(item);
      });
      listEl.prepend(sec);
    } catch {}
  }

  // ── Friend list ─────────────────────────────────────────────────
  function renderFriendList() {
    listEl.innerHTML = '';
    if (!state.contacts.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">${t('noContacts')}</div>
          <div class="empty-hint">${t('noContactsHint')}</div>
        </div>`;
      return;
    }
    const sorted = [...state.contacts].sort((a, b) =>
      (a.nickname || a.username).localeCompare(b.nickname || b.username));

    sorted.forEach(f => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const avWrap = document.createElement('div');
      avWrap.className = 'avatar-wrap';
      avWrap.appendChild(avatarEl(f.nickname || f.username, f.avatar));
      if (f.is_online) {
        const dot = document.createElement('div');
        dot.className = 'online-dot';
        avWrap.appendChild(dot);
      }
      item.appendChild(avWrap);
      const info = document.createElement('div');
      info.className = 'flex-1';
      info.innerHTML = `
        <div style="font-size:16px;font-weight:500">${esc(f.nickname || f.username)}</div>
        <div class="text-muted" style="font-size:13px">@${esc(f.username)}${f.is_online ? ` · <span style="color:var(--green)">${t('online')}</span>` : ''}</div>`;
      item.appendChild(info);
      item.onclick = () => openChat({ id: f.id, type: 'private', name: f.nickname || f.username, avatar: f.avatar });
      listEl.appendChild(item);
    });
  }

  // ── Search ───────────────────────────────────────────────────────
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) {
      resultsEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      return;
    }
    listEl.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = `<div class="section-header">${t('searchUsers')}</div>`;

    searchTimer = setTimeout(async () => {
      try {
        const users = await api.search(q);
        if (!users.length) {
          resultsEl.innerHTML += `<div class="empty-state" style="padding:32px"><div class="empty-icon" style="font-size:36px">🔍</div><div class="empty-hint">${t('noResults')}</div></div>`;
          return;
        }
        users.forEach(u => {
          const isFriend = state.contacts.some(c => c.id === u.id);
          const item = document.createElement('div');
          item.className = 'list-item';
          item.appendChild(avatarEl(u.nickname || u.username, u.avatar));
          const info = document.createElement('div');
          info.className = 'flex-1';
          info.innerHTML = `
            <div style="font-size:16px;font-weight:500">${esc(u.nickname || u.username)}</div>
            <div class="text-muted" style="font-size:13px">@${esc(u.username)}</div>`;
          item.appendChild(info);
          if (isFriend) {
            const tag = document.createElement('span');
            tag.className = 'text-muted';
            tag.style.fontSize = '13px';
            tag.textContent = t('alreadyFriend');
            item.appendChild(tag);
          } else {
            const btn = document.createElement('button');
            btn.className = 'btn-pill btn-green';
            btn.textContent = t('add');
            btn.onclick = async e => {
              e.stopPropagation();
              try {
                await api.sendRequest(u.id);
                showToast(t('requestSent'));
                btn.textContent = t('sent');
                btn.disabled = true;
                btn.className = 'btn-pill btn-outline';
              } catch (err) { showToast(err.message); }
            };
            item.appendChild(btn);
          }
          resultsEl.appendChild(item);
        });
      } catch { resultsEl.innerHTML += `<div class="empty-state" style="padding:32px"><div class="empty-hint">${t('searchFailed')}</div></div>`; }
    }, 380);
  });

  renderFriendList();
  loadRequests();
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
