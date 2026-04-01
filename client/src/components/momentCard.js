/**
 * Shared Moment Card Builder
 * Reusable card rendering for Moments feed and User Profile page.
 */
import { api } from '../api.js';
import { state, showToast, avatarEl, formatTime } from '../app.js';
import { t } from '../i18n.js';

/**
 * Build a single moment card DOM element.
 * @param {Object} m — enriched moment object from API
 * @param {Object} [opts] — options
 * @param {Function} [opts.onAvatarClick] — callback when avatar/name is clicked
 * @returns {HTMLElement}
 */
export function buildMomentCard(m, opts = {}) {
  const isMine = m.user_id === state.user?.id;
  const card = document.createElement('div');
  card.className = 'moment-card';
  card.dataset.id = m.id;

  // Header
  const av = avatarEl(m.nickname || m.username, m.avatar, 'moment-avatar');
  const header = document.createElement('div');
  header.className = 'moment-header';

  const avWrap = document.createElement('div');
  avWrap.className = 'moment-avatar-wrap';
  avWrap.appendChild(av);
  if (opts.onAvatarClick && !isMine) {
    avWrap.style.cursor = 'pointer';
    avWrap.onclick = (e) => { e.stopPropagation(); opts.onAvatarClick(m); };
  }
  header.appendChild(avWrap);

  const meta = document.createElement('div');
  meta.className = 'moment-meta';
  const nameEl = document.createElement('div');
  nameEl.className = 'moment-name';
  nameEl.textContent = m.nickname || m.username;
  if (opts.onAvatarClick && !isMine) {
    nameEl.style.cursor = 'pointer';
    nameEl.onclick = (e) => { e.stopPropagation(); opts.onAvatarClick(m); };
  }
  meta.appendChild(nameEl);
  const timeEl = document.createElement('div');
  timeEl.className = 'moment-time';
  timeEl.textContent = formatTime(new Date(m.created_at).getTime());
  meta.appendChild(timeEl);
  header.appendChild(meta);

  if (isMine) {
    const del = document.createElement('button');
    del.className = 'moment-delete-btn icon-btn';
    del.innerHTML = '<i class="fi fi-rr-trash"></i>';
    del.title = '删除';
    del.onclick = async () => {
      if (!confirm(t('deleteConfirm') || '确认删除这条动态？')) return;
      try { await api.deleteMoment(m.id); card.remove(); } catch { showToast('删除失败'); }
    };
    header.appendChild(del);
  }
  card.appendChild(header);

  // Text
  if (m.text_content) {
    const txt = document.createElement('div');
    txt.className = 'moment-text';
    txt.textContent = m.text_content;
    card.appendChild(txt);
  }

  // Video
  if (m.video && m.video.url) {
    const wrap = document.createElement('div');
    wrap.className = 'moment-video-wrap';
    const thumb = document.createElement('img');
    thumb.className = 'moment-video-thumb';
    thumb.loading = 'lazy';
    if (m.video.thumbnail) { thumb.src = m.video.thumbnail; }
    else { thumb.style.background = '#1a1a2e'; }
    wrap.appendChild(thumb);
    const playBtn = document.createElement('div');
    playBtn.className = 'moment-video-play';
    playBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>`;
    wrap.appendChild(playBtn);
    if (m.video.duration) {
      const dur = document.createElement('span');
      dur.className = 'moment-video-duration';
      dur.textContent = fmtDuration(m.video.duration);
      wrap.appendChild(dur);
    }
    wrap.onclick = () => openVideoPlayer(m.video.url);
    card.appendChild(wrap);
  }

  // Images grid
  if (!m.video && m.images && m.images.length > 0) {
    const grid = document.createElement('div');
    grid.className = `moment-images count-${m.images.length}`;
    m.images.forEach((url, i) => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'moment-img';
      img.loading = 'lazy';
      img.onclick = () => openLightbox(m.images, i);
      grid.appendChild(img);
    });
    card.appendChild(grid);
  }

  // Like avatars row
  if (m.likedUsers && m.likedUsers.length > 0) {
    card.appendChild(_buildLikeAvatarsRow(m.likedUsers));
  }

  // Actions bar
  const actions = document.createElement('div');
  actions.className = 'moment-actions';
  const likeBtn = document.createElement('button');
  likeBtn.className = `moment-like-btn${m.viewerLiked ? ' liked' : ''}`;
  const heartFilled = '<i class="fi fi-sr-heart"></i>';
  const heartOutline = '<i class="fi fi-rr-heart"></i>';
  likeBtn.innerHTML = `${m.viewerLiked ? heartFilled : heartOutline} ${m.likes || 0}`;
  likeBtn.onclick = async () => {
    try {
      const r = await api.likeMoment(m.id);
      m.viewerLiked = r.liked;
      m.likes = r.liked ? (m.likes || 0) + 1 : Math.max(0, (m.likes || 0) - 1);
      likeBtn.className = `moment-like-btn${m.viewerLiked ? ' liked' : ''}`;
      likeBtn.innerHTML = `${m.viewerLiked ? heartFilled : heartOutline} ${m.likes}`;
      if (r.liked) {
        if (!m.likedUsers) m.likedUsers = [];
        m.likedUsers.push({ id: state.user.id, nickname: state.user.nickname, username: state.user.username, avatar: state.user.avatar });
      } else {
        m.likedUsers = (m.likedUsers || []).filter(u => u.id !== state.user.id);
      }
      const oldRow = card.querySelector('.like-avatars-row');
      if (oldRow) oldRow.remove();
      if (m.likedUsers.length > 0) {
        card.insertBefore(_buildLikeAvatarsRow(m.likedUsers), actions);
      }
    } catch { showToast('操作失败'); }
  };
  const cmtBtn = document.createElement('button');
  cmtBtn.className = 'moment-comment-btn';
  cmtBtn.innerHTML = `<i class="fi fi-rr-comment"></i> ${(m.comments || []).length}`;
  actions.appendChild(likeBtn);
  actions.appendChild(cmtBtn);
  card.appendChild(actions);

  // Comments section
  const cmtSection = document.createElement('div');
  cmtSection.className = 'moment-comments';
  _renderComments(cmtSection, m, cmtBtn);
  card.appendChild(cmtSection);

  cmtBtn.onclick = () => {
    const inp = cmtSection.querySelector('.moment-comment-input');
    if (inp) inp.focus();
    else {
      const inputRow = _buildCommentInput(m, cmtSection, cmtBtn);
      cmtSection.appendChild(inputRow);
      inputRow.querySelector('input').focus();
    }
  };

  return card;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function openVideoPlayer(url) {
  const overlay = document.createElement('div');
  overlay.className = 'video-player-overlay';
  const close = document.createElement('button');
  close.className = 'video-player-close';
  close.innerHTML = '<i class="fi fi-rr-cross"></i>';
  close.onclick = () => { video.pause(); overlay.remove(); };
  const video = document.createElement('video');
  video.className = 'video-player-video';
  video.src = url;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  overlay.appendChild(close);
  overlay.appendChild(video);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) { video.pause(); overlay.remove(); } };
}

function openLightbox(urls, startIndex) {
  let idx = startIndex;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  const img = document.createElement('img');
  img.className = 'lightbox-img';
  const prev = document.createElement('button');
  prev.className = 'lightbox-btn'; prev.innerHTML = '<i class="fi fi-rr-angle-left"></i>';
  const next = document.createElement('button');
  next.className = 'lightbox-btn'; next.innerHTML = '<i class="fi fi-rr-angle-right"></i>';
  const close = document.createElement('button');
  close.className = 'lightbox-close'; close.innerHTML = '<i class="fi fi-rr-cross"></i>';
  overlay.append(close, prev, img, next);
  document.body.appendChild(overlay);
  const show = () => { img.src = urls[idx]; prev.style.display = idx > 0 ? '' : 'none'; next.style.display = idx < urls.length - 1 ? '' : 'none'; };
  prev.onclick = () => { idx--; show(); };
  next.onclick = () => { idx++; show(); };
  close.onclick = overlay.onclick = (e) => { if (e.target === overlay || e.target === close) overlay.remove(); };
  show();
}

function _buildLikeAvatarsRow(likedUsers) {
  const likeRow = document.createElement('div');
  likeRow.className = 'like-avatars-row';
  const heartIcon = document.createElement('span');
  heartIcon.className = 'like-avatars-heart';
  heartIcon.innerHTML = '<i class="fi fi-sr-heart"></i>';
  likeRow.appendChild(heartIcon);
  const avatarStack = document.createElement('div');
  avatarStack.className = 'like-avatar-stack';
  const maxShow = 8;
  likedUsers.slice(0, maxShow).forEach(u => {
    const av = avatarEl(u.nickname || u.username, u.avatar, 'like-avatar');
    av.title = u.nickname || u.username;
    avatarStack.appendChild(av);
  });
  if (likedUsers.length > maxShow) {
    const more = document.createElement('div');
    more.className = 'like-avatar like-avatar-more';
    more.textContent = `+${likedUsers.length - maxShow}`;
    avatarStack.appendChild(more);
  }
  likeRow.appendChild(avatarStack);
  likeRow.onclick = () => _openLikeList(likedUsers);
  return likeRow;
}

function _openLikeList(users) {
  const overlay = document.createElement('div');
  overlay.className = 'like-list-overlay';
  const card = document.createElement('div');
  card.className = 'like-list-card';
  card.innerHTML = `<div class="like-list-header">
    <span>${t('likedUsers')}</span>
    <button class="icon-btn like-list-close"><i class="fi fi-rr-cross-small"></i></button>
  </div>`;
  const list = document.createElement('div');
  list.className = 'like-list-body';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'like-list-row';
    row.appendChild(avatarEl(u.nickname || u.username, u.avatar, 'like-list-avatar'));
    const name = document.createElement('span');
    name.className = 'like-list-name';
    name.textContent = u.nickname || u.username;
    row.appendChild(name);
    list.appendChild(row);
  });
  card.appendChild(list);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  card.querySelector('.like-list-close').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

function _renderComments(container, m, cmtBtn) {
  container.querySelectorAll('.moment-comment-item').forEach(e => e.remove());
  (m.comments || []).forEach(c => {
    const row = document.createElement('div');
    row.className = 'moment-comment-item';
    const isMine = c.user_id === state.user?.id;
    row.innerHTML = `<span class="comment-author">${c.nickname || c.username}:</span>
      <span class="comment-text">${c.text_content}</span>
      ${isMine ? `<button class="comment-del-btn icon-btn" data-cid="${c.id}" title="删除"><i class="fi fi-rr-cross-small"></i></button>` : ''}`;
    if (isMine) {
      row.querySelector('.comment-del-btn').onclick = async () => {
        try {
          await api.deleteComment(m.id, c.id);
          m.comments = m.comments.filter(x => x.id !== c.id);
          row.remove();
          cmtBtn.textContent = '';
          cmtBtn.innerHTML = `<i class="fi fi-rr-comment"></i> ${m.comments.length}`;
        } catch { showToast('删除失败'); }
      };
    }
    container.appendChild(row);
  });
}

function _buildCommentInput(m, cmtSection, cmtBtn) {
  const row = document.createElement('div');
  row.className = 'moment-comment-input-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'moment-comment-input';
  inp.maxLength = 512;
  inp.placeholder = '说点什么...';
  const send = document.createElement('button');
  send.className = 'moment-comment-send';
  send.textContent = '发送';
  send.onclick = async () => {
    const txt = inp.value.trim();
    if (!txt) return;
    try {
      const r = await api.addComment(m.id, txt);
      m.comments = m.comments || [];
      m.comments.push({ id: r.id, user_id: state.user.id, text_content: txt,
        nickname: state.user.nickname, username: state.user.username });
      _renderComments(cmtSection, m, cmtBtn);
      cmtBtn.innerHTML = `<i class="fi fi-rr-comment"></i> ${m.comments.length}`;
      row.remove();
    } catch { showToast('发送失败'); }
  };
  inp.onkeydown = e => { if (e.key === 'Enter') send.click(); };
  row.appendChild(inp);
  row.appendChild(send);
  return row;
}
