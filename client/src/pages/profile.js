/**
 * Profile / Settings page — i18n v2
 */
import { state, showToast, avatarEl } from '../app.js';
import { api, clearToken } from '../api.js';
import { disconnect } from '../socket.js';
import { t, getLang, getLangName, getLangFlag, getSupportedLangs, setLang, onLangChange, offLangChange } from '../i18n.js';

export function renderProfile(root) {
  const u = state.user;

  function buildPage() {
    root.innerHTML = `
      <div class="topbar">
        <div style="min-width:44px"></div>
        <div class="topbar-title">${t('profileTitle')}</div>
        <div style="min-width:44px"></div>
      </div>

      <!-- Hero card -->
      <div class="profile-hero">
        <div class="avatar-upload-wrap" id="avatar-upload-trigger">
          <div id="av-wrap"></div>
          <div class="avatar-camera-badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg></div>
        </div>
        <input type="file" id="avatar-file-input" accept="image/*" class="hidden">
        <div class="profile-info">
          <div class="profile-name">${esc(u.nickname || u.username)}</div>
          <div class="profile-username">@${esc(u.username)}</div>
          <div class="profile-enc-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="margin-right:3px"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg> E2E</div>
        </div>
        <span class="profile-arrow">›</span>
      </div>

      <!-- Settings groups -->
      <div class="section-header" style="padding-top:12px"></div>

      <div class="card-group" id="g-identity">
        <div class="settings-item" id="change-avatar">
          <div class="settings-icon" style="background:#FF9500"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg></div>
          <span class="settings-label">${t('changeAvatar')}</span>
          <span class="settings-chevron">›</span>
        </div>
        <div class="settings-item" id="change-nickname">
          <div class="settings-icon" style="background:#07C160"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div>
          <span class="settings-label">${t('changeNickname')}</span>
          <span class="settings-value" id="cur-nickname">${esc(u.nickname || u.username)}</span>
          <span class="settings-chevron">›</span>
        </div>
      </div>

      <div class="card-group" id="g-security">
        <div class="settings-item">
          <div class="settings-icon" style="background:#007AFF"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg></div>
          <span class="settings-label">${t('e2eLabel')}</span>
          <span class="settings-value">${t('e2eValue')}</span>
        </div>
        <div class="settings-item">
          <div class="settings-icon" style="background:#AF52DE"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></div>
          <span class="settings-label">${t('pqLabel')}</span>
          <span class="settings-value">${t('pqValue')}</span>
        </div>
        <div class="settings-item" id="export-keys">
          <div class="settings-icon" style="background:#FF9500"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg></div>
          <span class="settings-label">${t('keyFingerprint')}</span>
          <span class="settings-chevron">›</span>
        </div>
      </div>

      <div class="card-group" id="g-prefs">
        <div class="settings-item" id="lang-btn">
          <div class="settings-icon" style="background:#34C759"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg></div>
          <span class="settings-label">${t('language')}</span>
          <span class="settings-value">${getLangName(getLang())}</span>
          <span class="settings-chevron">›</span>
        </div>
        <div class="settings-item">
          <div class="settings-icon" style="background:#636366"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg></div>
          <span class="settings-label">${t('version')}</span>
          <span class="settings-value">PaperPhone v1.1</span>
        </div>
        <div class="settings-item" id="pwa-install">
          <div class="settings-icon" style="background:#FF3B30"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M15.5 1h-8A2.5 2.5 0 0 0 5 3.5v17A2.5 2.5 0 0 0 7.5 23h8a2.5 2.5 0 0 0 2.5-2.5v-17A2.5 2.5 0 0 0 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z"/></svg></div>
          <span class="settings-label">${t('addHomescreen')}</span>
          <span class="settings-chevron">›</span>
        </div>
      </div>

      <div class="card-group" style="margin-top:8px">
        <div class="settings-item" id="logout-btn" style="justify-content:center">
          <span style="color:var(--red);font-size:16px;font-weight:500">${t('logout')}</span>
        </div>
      </div>

      <div style="height:24px"></div>
    `;

    // Avatar
    root.querySelector('#av-wrap').appendChild(avatarEl(u.nickname || u.username, u.avatar, 'avatar-lg'));

    // Avatar upload — hero click or settings item click
    const avatarFileInput = root.querySelector('#avatar-file-input');
    const triggerAvatarUpload = () => avatarFileInput.click();
    root.querySelector('#avatar-upload-trigger').onclick = triggerAvatarUpload;
    root.querySelector('#change-avatar').onclick = triggerAvatarUpload;
    avatarFileInput.addEventListener('change', async () => {
      const file = avatarFileInput.files[0];
      if (!file) return;
      try {
        showToast(t('uploading'));
        const { url } = await api.upload(file);
        await api.updateMe({ avatar: url });
        state.user.avatar = url;
        showToast(t('avatarUpdated'));
        buildPage(); // re-render to show new avatar
      } catch { showToast(t('avatarFailed')); }
      avatarFileInput.value = '';
    });

    // Change nickname
    root.querySelector('#change-nickname').onclick = async () => {
      const nn = prompt(t('nicknamePrompt'), u.nickname || u.username);
      if (nn && nn.trim()) {
        try {
          await api.updateMe({ nickname: nn.trim() });
          state.user.nickname = nn.trim();
          root.querySelector('#cur-nickname').textContent = nn.trim();
          root.querySelector('.profile-name').textContent = nn.trim();
          showToast(t('nicknameUpdated'));
        } catch { showToast(t('updateFailed')); }
      }
    };

    // Key fingerprint
    root.querySelector('#export-keys').onclick = async () => {
      const { getKey } = await import('../crypto/keystore.js');
      const ik = await getKey('ik');
      if (ik) {
        const fp = ik.publicKey.slice(0, 24).replace(/(.{4})/g, '$1 ').trim();
        alert(`${t('fpLabel')}:\n${fp}\n\n${t('fpWarning')}`);
      } else {
        showToast(t('noKey'));
      }
    };

    // Language picker
    root.querySelector('#lang-btn').onclick = () => openLangPicker(buildPage);

    // iOS PWA
    root.querySelector('#pwa-install').onclick = () => {
      alert(`${t('iosInstallTitle')}\n\n${t('iosInstallSteps')}`);
    };

    // Logout
    root.querySelector('#logout-btn').onclick = () => {
      if (!confirm(t('logoutConfirm'))) return;
      clearToken();
      disconnect();
      // Clear all persisted crypto keys from every storage tier
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('ppkl_') || k.startsWith('ppk_')) localStorage.removeItem(k);
        }
        for (const k of Object.keys(sessionStorage)) {
          if (k.startsWith('ppkl_') || k.startsWith('ppk_')) sessionStorage.removeItem(k);
        }
      } catch {}
      state.user = null;
      state.chats = [];
      state.contacts = [];
      window.location.reload();
    };
  }

  buildPage();

  // Re-render if language changes while page is open
  const handler = () => buildPage();
  onLangChange(handler);
  root._cleanup = () => offLangChange(handler);
}

function openLangPicker(onClose) {
  const picker = document.createElement('div');
  picker.className = 'lang-picker';
  picker.innerHTML = `
    <div class="lang-picker-backdrop"></div>
    <div class="lang-picker-sheet">
      <div class="lang-picker-handle"></div>
      <div class="lang-picker-title">${t('language')}</div>
      ${getSupportedLangs().map(code => `
        <div class="lang-option ${code === getLang() ? 'selected' : ''}" data-code="${code}">
          <span class="lang-flag">${getLangFlag(code)}</span>
          <span class="lang-name">${getLangName(code)}</span>
          ${code === getLang() ? '<span class="lang-check"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg></span>' : ''}
        </div>
      `).join('')}
    </div>
  `;
  const close = () => { picker.remove(); onClose?.(); };
  picker.querySelector('.lang-picker-backdrop').onclick = close;
  picker.querySelectorAll('.lang-option').forEach(el => {
    el.onclick = () => { setLang(el.dataset.code); close(); };
  });
  document.body.appendChild(picker);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
