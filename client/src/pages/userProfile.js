/**
 * User Profile Page — WeChat-style
 * Shows user info, action buttons, privacy toggles, and their Moments feed.
 */
import { api } from '../api.js';
import { state, showToast, avatarEl, formatTime, openChat, goBack } from '../app.js';
import { t } from '../i18n.js';
import { buildMomentCard } from '../components/momentCard.js';

export function renderUserProfile(root, user) {
  const isSelf = user.id === state.user?.id;

  const page = document.createElement('div');
  page.className = 'page-user-profile';

  // ── Topbar ──────────────────────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.className = 'topbar user-profile-topbar';
  topbar.innerHTML = `
    <button class="icon-btn" id="up-back"><i class="fi fi-rr-angle-left"></i></button>
    <div class="topbar-title">${t('userProfile')}</div>
    <div style="min-width:44px"></div>
  `;
  page.appendChild(topbar);

  // ── Scrollable content ──────────────────────────────────────────────────
  const content = document.createElement('div');
  content.className = 'user-profile-content';

  // ── Hero Card ───────────────────────────────────────────────────────────
  const hero = document.createElement('div');
  hero.className = 'user-profile-hero';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'user-profile-avatar-wrap';
  const av = avatarEl(user.nickname || user.username, user.avatar, 'user-profile-avatar');
  avatarWrap.appendChild(av);

  // Online indicator
  if (user.is_online) {
    const dot = document.createElement('div');
    dot.className = 'user-profile-online-dot';
    avatarWrap.appendChild(dot);
  }
  hero.appendChild(avatarWrap);

  const info = document.createElement('div');
  info.className = 'user-profile-info';
  info.innerHTML = `
    <div class="user-profile-name">${esc(user.nickname || user.username)}</div>
    <div class="user-profile-username">@${esc(user.username)}</div>
    ${user.is_online
      ? `<div class="user-profile-status user-profile-status-online">${t('online')}</div>`
      : ''}
  `;
  hero.appendChild(info);
  content.appendChild(hero);

  // ── Action Buttons ──────────────────────────────────────────────────────
  if (!isSelf) {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'user-profile-actions';

    const msgBtn = _actionBtn(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`,
      t('sendMessage')
    );
    msgBtn.onclick = () => {
      openChat({ id: user.id, type: 'private', name: user.nickname || user.username, avatar: user.avatar });
    };

    const voiceBtn = _actionBtn(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>`,
      t('callVoice')
    );
    voiceBtn.onclick = () => {
      import('../services/webrtc.js').then(({ callManager }) => {
        callManager.startCall(user.id, user.nickname || user.username, user.avatar, false);
      });
    };

    const videoBtn = _actionBtn(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
      t('callVideo')
    );
    videoBtn.onclick = () => {
      import('../services/webrtc.js').then(({ callManager }) => {
        callManager.startCall(user.id, user.nickname || user.username, user.avatar, true);
      });
    };

    actionsRow.appendChild(msgBtn);
    actionsRow.appendChild(voiceBtn);
    actionsRow.appendChild(videoBtn);
    content.appendChild(actionsRow);

    // ── Privacy Settings Card ─────────────────────────────────────────────
    const privCard = document.createElement('div');
    privCard.className = 'user-profile-card';

    const privTitle = document.createElement('div');
    privTitle.className = 'user-profile-card-title';
    privTitle.textContent = t('momentPrivacy') || '朋友圈权限';
    privCard.appendChild(privTitle);

    let privacyState = { hide_their: false, hide_mine: false };

    // Hide their moments toggle
    const hideTheirRow = _toggleRow(
      t('hideMoments'),
      t('hideMomentsDesc'),
      false,
      async (checked) => {
        privacyState.hide_their = checked;
        try {
          await api.setMomentPrivacy(user.id, privacyState);
          showToast(checked ? (t('hideMomentsOn') || '已开启') : (t('hideMomentsOff') || '已关闭'));
          // Refresh moments list
          if (checked) {
            momentsFeed.innerHTML = `<div class="user-profile-moments-empty">
              <i class="fi fi-rr-eye-crossed" style="font-size:32px;color:var(--text-secondary);margin-bottom:8px"></i>
              <div style="color:var(--text-secondary);font-size:14px">${t('momentsHidden') || '朋友圈已隐藏'}</div>
            </div>`;
          } else {
            loadMoments();
          }
        } catch { showToast(t('opFailed')); }
      }
    );

    // Hide my moments toggle
    const hideMineRow = _toggleRow(
      t('hideMyMoments'),
      t('hideMyMomentsDesc'),
      false,
      async (checked) => {
        privacyState.hide_mine = checked;
        try {
          await api.setMomentPrivacy(user.id, privacyState);
          showToast(checked ? (t('hideMyMomentsOn') || '已开启') : (t('hideMyMomentsOff') || '已关闭'));
        } catch { showToast(t('opFailed')); }
      }
    );

    privCard.appendChild(hideTheirRow);
    privCard.appendChild(hideMineRow);
    content.appendChild(privCard);

    // Load privacy state
    api.getMomentPrivacy(user.id).then(p => {
      privacyState = p;
      hideTheirRow.querySelector('.up-toggle-input').checked = p.hide_their;
      hideMineRow.querySelector('.up-toggle-input').checked = p.hide_mine;
    }).catch(() => {});
  }

  // ── Moments Section ─────────────────────────────────────────────────────
  const momentsHeader = document.createElement('div');
  momentsHeader.className = 'user-profile-section-header';
  momentsHeader.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="opacity:.6;margin-right:6px">
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
    </svg>
    ${isSelf ? t('myMoments') || '我的朋友圈' : t('theirMoments')}
  `;
  content.appendChild(momentsHeader);

  const momentsFeed = document.createElement('div');
  momentsFeed.className = 'user-profile-moments-feed';
  content.appendChild(momentsFeed);

  const loadingEl = document.createElement('div');
  loadingEl.className = 'moments-loading';
  loadingEl.style.display = 'none';
  loadingEl.innerHTML = '<div class="spinner"></div>';
  content.appendChild(loadingEl);

  page.appendChild(content);
  root.innerHTML = '';
  root.appendChild(page);

  // ── Back ────────────────────────────────────────────────────────────────
  page.querySelector('#up-back').onclick = () => {
    import('../app.js').then(({ state, navigateTo }) => {
      state.activeTab = 'contacts';
      navigateTo('contacts');
    });
  };

  // ── Load Moments ───────────────────────────────────────────────────────
  let oldestTs = null;
  let exhausted = false;
  let fetchLock = false;

  async function loadMoments(append = false) {
    if (fetchLock || exhausted) return;
    fetchLock = true;
    loadingEl.style.display = 'flex';
    try {
      const items = await api.userMoments(user.id, append ? oldestTs : null);
      if (!append) momentsFeed.innerHTML = '';
      if (items.length === 0) {
        exhausted = true;
        if (!append) {
          momentsFeed.innerHTML = `<div class="user-profile-moments-empty">
            <i class="fi fi-rr-picture" style="font-size:32px;color:var(--text-secondary);margin-bottom:8px"></i>
            <div style="color:var(--text-secondary);font-size:14px">${t('noTheirMoments')}</div>
          </div>`;
        }
      } else {
        items.forEach(m => momentsFeed.appendChild(buildMomentCard(m)));
        oldestTs = items[items.length - 1].created_at;
        if (items.length < 20) exhausted = true;
      }
    } catch {
      showToast(t('opFailed'));
    } finally {
      fetchLock = false;
      loadingEl.style.display = 'none';
    }
  }

  // Infinite scroll
  content.addEventListener('scroll', () => {
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 200) {
      loadMoments(true);
    }
  }, { passive: true });

  loadMoments();
}

// ── Helper: action button ─────────────────────────────────────────────────
function _actionBtn(iconSvg, label) {
  const btn = document.createElement('button');
  btn.className = 'user-profile-action-btn';
  btn.innerHTML = `
    <div class="user-profile-action-icon">${iconSvg}</div>
    <span class="user-profile-action-label">${label}</span>
  `;
  return btn;
}

// ── Helper: toggle row ────────────────────────────────────────────────────
function _toggleRow(label, desc, checked, onChange) {
  const row = document.createElement('div');
  row.className = 'up-toggle-row';
  row.innerHTML = `
    <div class="up-toggle-info">
      <div class="up-toggle-label">${label}</div>
      <div class="up-toggle-desc">${desc}</div>
    </div>
    <label class="up-toggle-switch">
      <input type="checkbox" class="up-toggle-input" ${checked ? 'checked' : ''}>
      <span class="up-toggle-slider"></span>
    </label>
  `;
  row.querySelector('.up-toggle-input').addEventListener('change', (e) => {
    onChange(e.target.checked);
  });
  return row;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
