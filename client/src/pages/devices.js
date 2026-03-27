/**
 * Devices (Active Sessions) page — PaperPhone
 *
 * Full-screen sub-page showing all logged-in devices.
 * Supports: revoke single session, revoke all other sessions.
 */
import { state, showToast, goBack } from '../app.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

export function renderDevices(root) {
  root.innerHTML = `
    <div class="topbar">
      <button class="topbar-btn" id="devices-back">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="topbar-title">${t('devices')}</div>
      <div style="min-width:44px"></div>
    </div>
    <div id="devices-content"><div class="devices-loading">${t('loading') || '...'}</div></div>
  `;

  root.querySelector('#devices-back').onclick = () => goBack();

  loadSessions(root.querySelector('#devices-content'));
}

async function loadSessions(container) {
  try {
    const { sessions } = await api.sessions();
    renderSessions(container, sessions);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">${err.message}</div></div>`;
  }
}

function renderSessions(container, sessions) {
  const current = sessions.find(s => s.is_current);
  const others = sessions.filter(s => !s.is_current);

  container.innerHTML = '';

  // ── Current Device ─────────────────────────────────────────────────
  if (current) {
    const section = document.createElement('div');
    section.innerHTML = `
      <div class="section-header" style="padding-top:8px">${t('currentDevice')}</div>
      <div class="card-group">
        <div class="settings-item device-item device-current">
          <div class="device-icon-wrap device-current-icon">${deviceIcon(current.device_type)}</div>
          <div class="device-info">
            <div class="device-name">${esc(current.device_name || 'Unknown')}</div>
            <div class="device-detail">${esc(formatDetail(current))}</div>
            <div class="device-online">${t('online')}</div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(section);
  }

  // ── Other Devices ──────────────────────────────────────────────────
  const otherSection = document.createElement('div');
  if (others.length === 0) {
    otherSection.innerHTML = `
      <div class="section-header">${t('otherDevices')}</div>
      <div class="card-group">
        <div class="settings-item" style="justify-content:center;opacity:0.5">
          <span>${t('noOtherDevices')}</span>
        </div>
      </div>
    `;
  } else {
    otherSection.innerHTML = `<div class="section-header">${t('otherDevices')}</div>`;
    const group = document.createElement('div');
    group.className = 'card-group';

    others.forEach(session => {
      const item = document.createElement('div');
      item.className = 'settings-item device-item';
      item.innerHTML = `
        <div class="device-icon-wrap">${deviceIcon(session.device_type)}</div>
        <div class="device-info">
          <div class="device-name">${esc(session.device_name || 'Unknown')}</div>
          <div class="device-detail">${esc(formatDetail(session))}</div>
        </div>
        <button class="device-revoke-btn" title="${t('revokeDevice')}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;
      item.querySelector('.device-revoke-btn').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(t('revokeConfirm'))) return;
        try {
          await api.revokeSession(session.id);
          showToast(t('sessionRevoked'));
          item.style.transition = 'opacity 0.3s, max-height 0.3s';
          item.style.opacity = '0';
          item.style.maxHeight = '0';
          item.style.overflow = 'hidden';
          setTimeout(() => {
            item.remove();
            // Check if no more others
            if (group.children.length === 0) {
              otherSection.innerHTML = `
                <div class="section-header">${t('otherDevices')}</div>
                <div class="card-group">
                  <div class="settings-item" style="justify-content:center;opacity:0.5">
                    <span>${t('noOtherDevices')}</span>
                  </div>
                </div>
              `;
              // Remove revoke-all button if present
              container.querySelector('#revoke-all-wrap')?.remove();
            }
          }, 300);
        } catch (err) {
          showToast(err.message);
        }
      };
      group.appendChild(item);
    });

    otherSection.appendChild(group);
  }
  container.appendChild(otherSection);

  // ── Revoke All Button ──────────────────────────────────────────────
  if (others.length > 0) {
    const wrap = document.createElement('div');
    wrap.id = 'revoke-all-wrap';
    wrap.innerHTML = `
      <div class="card-group" style="margin-top:16px">
        <div class="settings-item" id="revoke-all-btn" style="justify-content:center">
          <span style="color:var(--red);font-size:15px;font-weight:500">${t('revokeAllOther')}</span>
        </div>
      </div>
    `;
    wrap.querySelector('#revoke-all-btn').onclick = async () => {
      if (!confirm(t('revokeAllConfirm'))) return;
      try {
        const { revoked } = await api.revokeAllOther();
        showToast(`${t('sessionRevoked')} (${revoked})`);
        loadSessions(container); // full refresh
      } catch (err) {
        showToast(err.message);
      }
    };
    container.appendChild(wrap);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDetail(session) {
  const parts = [];
  if (session.ip_address) parts.push(`IP: ${session.ip_address}`);
  if (session.last_active) {
    const d = new Date(session.last_active);
    const now = new Date();
    const diff = now - d;
    if (diff < 60e3) parts.push(t('lastActive') + ': < 1m');
    else if (diff < 3600e3) parts.push(t('lastActive') + `: ${Math.floor(diff / 60e3)}m`);
    else if (d.toDateString() === now.toDateString()) parts.push(t('lastActive') + `: ${d.toTimeString().slice(0, 5)}`);
    else parts.push(t('lastActive') + `: ${d.getMonth() + 1}/${d.getDate()}`);
  }
  return parts.join(' · ') || '';
}

function deviceIcon(type) {
  switch (type) {
    case 'mobile':
      return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.5 1h-8A2.5 2.5 0 0 0 5 3.5v17A2.5 2.5 0 0 0 7.5 23h8a2.5 2.5 0 0 0 2.5-2.5v-17A2.5 2.5 0 0 0 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z"/></svg>`;
    case 'tablet':
      return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18.5 0h-14A2.5 2.5 0 0 0 2 2.5v19A2.5 2.5 0 0 0 4.5 24h14a2.5 2.5 0 0 0 2.5-2.5v-19A2.5 2.5 0 0 0 18.5 0zm-7 23c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7.5-4H4V3h15v16z"/></svg>`;
    default: // desktop
      return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z"/></svg>`;
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
