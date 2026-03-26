/**
 * Chats list page — i18n v2
 */
import { state, openChat, avatarEl, formatTime } from '../app.js';
import { t } from '../i18n.js';

export function renderChats(root) {
  const sorted = [...state.chats].sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));

  root.innerHTML = `
    <div class="topbar">
      <div style="min-width:44px"></div>
      <div class="topbar-title">${t('chatsTitle')}</div>
      <button class="topbar-btn topbar-action" id="new-chat-btn" title="Edit">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>
    </div>
    <div class="search-wrap">
      <input class="search-input" id="chats-search" placeholder="${t('searchPlaceholder')}">
    </div>
    <div id="chat-list"></div>
  `;

  const listEl = root.querySelector('#chat-list');
  const searchEl = root.querySelector('#chats-search');

  function renderList(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity=".5"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div>
          <div class="empty-title">${t('noChats')}</div>
          <div class="empty-hint">${t('noChatsHint')}</div>
        </div>`;
      return;
    }

    items.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const av = avatarEl(chat.name, chat.avatar);
      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      meta.innerHTML = `
        <div class="chat-name-row">
          <span class="chat-name">${esc(chat.name)}</span>
          <span class="chat-time">${chat.lastTs ? formatTime(chat.lastTs) : ''}</span>
        </div>
        <div class="chat-preview-row">
          <span class="chat-preview">${esc(chat.lastMsg || t('tapToChat'))}</span>
          ${chat.unread > 0 ? `<span class="badge">${chat.unread > 99 ? '99+' : chat.unread}</span>` : ''}
        </div>`;

      item.appendChild(av);
      item.appendChild(meta);
      item.addEventListener('click', () => { chat.unread = 0; openChat(chat); });
      listEl.appendChild(item);
    });
  }

  renderList(sorted);

  // Local filter search
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    renderList(q ? sorted.filter(c => (c.name || '').toLowerCase().includes(q)) : sorted);
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
