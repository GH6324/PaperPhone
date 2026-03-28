/**
 * Groups list page — create / browse groups
 */
import { state, openChat, avatarEl, showToast } from '../app.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

let _listEl = null;

export function renderGroups(root) {
  root.innerHTML = `
    <div class="topbar">
      <div style="min-width:44px"></div>
      <div class="topbar-title">${t('groupsTitle')}</div>
      <button class="topbar-btn topbar-action" id="create-group-btn" title="${t('createGroup')}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>
    </div>
    <div class="search-wrap">
      <input class="search-input" id="groups-search" placeholder="${t('searchPlaceholder')}">
    </div>
    <div id="group-list"></div>
  `;

  _listEl = root.querySelector('#group-list');
  const searchEl = root.querySelector('#groups-search');

  renderList(getGroups());

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    const all = getGroups();
    renderList(q ? all.filter(g => (g.name || '').toLowerCase().includes(q)) : all);
  });

  root.querySelector('#create-group-btn').onclick = () => showCreateGroupModal();
}

function getGroups() {
  return (state.groupsList || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function refreshGroupList() {
  if (!_listEl || !document.body.contains(_listEl)) return;
  renderList(getGroups());
}

function renderList(items) {
  if (!_listEl) return;
  _listEl.innerHTML = '';
  if (!items.length) {
    _listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity=".5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
        <div class="empty-title">${t('noGroups')}</div>
        <div class="empty-hint">${t('noGroupsHint')}</div>
      </div>`;
    return;
  }

  items.forEach(g => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.appendChild(avatarEl(g.name, g.avatar));
    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.innerHTML = `
      <div class="chat-name-row">
        <span class="chat-name">${esc(g.name)}</span>
        <span class="text-muted" style="font-size:12px">${g.member_count || ''}${t('nMembers')}</span>
      </div>
      <div class="chat-preview-row">
        <span class="chat-preview text-muted">${esc(g.notice || '')}</span>
      </div>`;
    item.appendChild(meta);
    item.addEventListener('click', () => {
      openChat({ id: g.id, type: 'group', name: g.name, avatar: g.avatar });
    });
    _listEl.appendChild(item);
  });
}

function showCreateGroupModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" style="width:90%;max-width:420px;max-height:80vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <button class="topbar-btn" id="modal-cancel">${t('cancel')}</button>
        <div class="topbar-title" style="font-size:16px">${t('createGroup')}</div>
        <button class="btn-pill btn-green" id="modal-create" disabled>${t('createGroup')}</button>
      </div>
      <div style="padding:16px;flex:1;overflow-y:auto;">
        <input class="search-input" id="group-name-input" placeholder="${t('groupNamePlaceholder')}" style="margin-bottom:16px;">
        <div class="section-header">${t('selectMembers')}</div>
        <div id="member-picker" style="max-height:40vh;overflow-y:auto;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#group-name-input');
  const createBtn = overlay.querySelector('#modal-create');
  const cancelBtn = overlay.querySelector('#modal-cancel');
  const pickerEl = overlay.querySelector('#member-picker');
  const selected = new Set();

  // Render friends as checkable items
  const friends = state.contacts || [];
  friends.forEach(f => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.style.cursor = 'pointer';

    const checkbox = document.createElement('div');
    checkbox.className = 'member-checkbox';
    checkbox.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="var(--text-muted)" stroke-width="2"/></svg>`;
    item.appendChild(checkbox);

    item.appendChild(avatarEl(f.nickname || f.username, f.avatar, 'avatar-sm'));
    const info = document.createElement('span');
    info.style.cssText = 'font-size:15px;font-weight:500;margin-left:8px;';
    info.textContent = f.nickname || f.username;
    item.appendChild(info);

    item.addEventListener('click', () => {
      if (selected.has(f.id)) {
        selected.delete(f.id);
        checkbox.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="var(--text-muted)" stroke-width="2"/></svg>`;
      } else {
        selected.add(f.id);
        checkbox.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--green)"><rect x="3" y="3" width="18" height="18" rx="4" fill="var(--green)"/><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#fff"/></svg>`;
      }
      updateCreateBtn();
    });
    pickerEl.appendChild(item);
  });

  function updateCreateBtn() {
    createBtn.disabled = !nameInput.value.trim() || selected.size === 0;
  }
  nameInput.addEventListener('input', updateCreateBtn);

  cancelBtn.onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  createBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name || selected.size === 0) return;
    createBtn.disabled = true;
    createBtn.textContent = '...';
    try {
      const group = await api.createGroup({ name, member_ids: [...selected] });
      // Add to local state
      if (!state.groupsList) state.groupsList = [];
      state.groupsList.push({ ...group, member_count: selected.size + 1 });
      // Also add to chats list
      state.chats.push({
        id: group.id, type: 'group', name: group.name, avatar: group.avatar || null,
        lastMsg: '', lastTs: Date.now(), unread: 0,
      });
      showToast(t('groupCreated'));
      overlay.remove();
      refreshGroupList();
    } catch (err) {
      showToast(err.message);
      createBtn.disabled = false;
      createBtn.textContent = t('createGroup');
    }
  };
}
