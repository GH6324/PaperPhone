/**
 * Moments (朋友圈) Page
 * WeChat-style social feed: text + up to 9 images, likes, comments
 */
import { api } from '../api.js';
import { state, showToast, avatarEl, formatTime } from '../app.js';
import { t } from '../i18n.js';

export function renderMoments(root) {
  root.innerHTML = '';

  // ── Shell ────────────────────────────────────────────────────────────────
  const page = document.createElement('div');
  page.className = 'page-moments';
  page.innerHTML = `
    <div class="topbar moments-topbar">
      <button class="icon-btn" id="moments-back">‹</button>
      <div class="topbar-title">${t('moments')}</div>
      <button class="icon-btn" id="moments-compose">✏️</button>
    </div>
    <div id="moments-feed" class="moments-feed"></div>
    <div id="moments-loading" class="moments-loading" style="display:none">
      <div class="spinner"></div>
    </div>
  `;
  root.appendChild(page);

  const feed = page.querySelector('#moments-feed');
  const loading = page.querySelector('#moments-loading');
  let oldestTs = null;
  let exhausted = false;
  let fetchLock = false;

  // Back button
  page.querySelector('#moments-back').onclick = () => {
    import('../app.js').then(({ state, render }) => {
      state.activeTab = 'discover';
      render ? render() : window.location.reload();
    });
  };

  // Compose button
  page.querySelector('#moments-compose').onclick = () => openCompose();

  // ── Load feed ─────────────────────────────────────────────────────────
  async function loadFeed(append = false) {
    if (fetchLock || exhausted) return;
    fetchLock = true;
    loading.style.display = 'flex';
    try {
      const items = await api.momentsFeed(append ? oldestTs : null);
      if (!append) feed.innerHTML = '';
      if (items.length === 0) {
        exhausted = true;
        if (!append) {
          feed.innerHTML = `<div class="moments-empty">
            <div style="font-size:48px;margin-bottom:12px">🌐</div>
            <div style="color:var(--text-secondary)">${t('noMoments') || '暂无动态，快去发布吧'}</div>
          </div>`;
        }
      } else {
        items.forEach(m => feed.appendChild(buildCard(m)));
        oldestTs = items[items.length - 1].created_at;
        if (items.length < 20) exhausted = true;
      }
    } catch {
      showToast(t('opFailed') || '加载失败');
    } finally {
      fetchLock = false;
      loading.style.display = 'none';
    }
  }

  // infinite scroll
  page.querySelector('#moments-feed').addEventListener('scroll', () => {
    const el = feed;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadFeed(true);
  }, { passive: true });
  // Listen on window scroll too in case feed isn't scrollable
  const scrollHandler = () => {
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 200) loadFeed(true);
  };
  root.addEventListener('scroll', scrollHandler, { passive: true });
  root._cleanup = () => root.removeEventListener('scroll', scrollHandler);

  loadFeed();

  // ── Build moment card ──────────────────────────────────────────────────
  function buildCard(m) {
    const isMine = m.user_id === state.user?.id;
    const card = document.createElement('div');
    card.className = 'moment-card';
    card.dataset.id = m.id;

    // Header
    const av = avatarEl(m.nickname || m.username, m.avatar, 'moment-avatar');
    const header = document.createElement('div');
    header.className = 'moment-header';
    header.appendChild(av);
    const meta = document.createElement('div');
    meta.className = 'moment-meta';
    meta.innerHTML = `<div class="moment-name">${m.nickname || m.username}</div>
      <div class="moment-time">${formatTime(new Date(m.created_at).getTime())}</div>`;
    header.appendChild(meta);
    if (isMine) {
      const del = document.createElement('button');
      del.className = 'moment-delete-btn icon-btn';
      del.textContent = '🗑';
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

    // Images grid
    if (m.images && m.images.length > 0) {
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

    // Actions bar
    const actions = document.createElement('div');
    actions.className = 'moment-actions';
    const likeBtn = document.createElement('button');
    likeBtn.className = `moment-like-btn${m.viewerLiked ? ' liked' : ''}`;
    likeBtn.innerHTML = `${m.viewerLiked ? '❤️' : '🤍'} ${m.likes || 0}`;
    likeBtn.onclick = async () => {
      try {
        const r = await api.likeMoment(m.id);
        m.viewerLiked = r.liked;
        m.likes = r.liked ? (m.likes || 0) + 1 : Math.max(0, (m.likes || 0) - 1);
        likeBtn.className = `moment-like-btn${m.viewerLiked ? ' liked' : ''}`;
        likeBtn.innerHTML = `${m.viewerLiked ? '❤️' : '🤍'} ${m.likes}`;
      } catch { showToast('操作失败'); }
    };
    const cmtBtn = document.createElement('button');
    cmtBtn.className = 'moment-comment-btn';
    cmtBtn.textContent = `💬 ${(m.comments || []).length}`;
    actions.appendChild(likeBtn);
    actions.appendChild(cmtBtn);
    card.appendChild(actions);

    // Comments section
    const cmtSection = document.createElement('div');
    cmtSection.className = 'moment-comments';
    renderComments(cmtSection, m, cmtBtn);
    card.appendChild(cmtSection);

    cmtBtn.onclick = () => {
      const inp = cmtSection.querySelector('.moment-comment-input');
      if (inp) inp.focus();
      else {
        const inputRow = buildCommentInput(m, cmtSection, cmtBtn);
        cmtSection.appendChild(inputRow);
        inputRow.querySelector('input').focus();
      }
    };

    return card;
  }

  function renderComments(container, m, cmtBtn) {
    container.querySelectorAll('.moment-comment-item').forEach(e => e.remove());
    (m.comments || []).forEach(c => {
      const row = document.createElement('div');
      row.className = 'moment-comment-item';
      const isMine = c.user_id === state.user?.id;
      row.innerHTML = `<span class="comment-author">${c.nickname || c.username}:</span>
        <span class="comment-text">${c.text_content}</span>
        ${isMine ? `<button class="comment-del-btn icon-btn" data-cid="${c.id}" title="删除">✕</button>` : ''}`;
      if (isMine) {
        row.querySelector('.comment-del-btn').onclick = async () => {
          try {
            await api.deleteComment(m.id, c.id);
            m.comments = m.comments.filter(x => x.id !== c.id);
            row.remove();
            cmtBtn.textContent = `💬 ${m.comments.length}`;
          } catch { showToast('删除失败'); }
        };
      }
      container.appendChild(row);
    });
  }

  function buildCommentInput(m, cmtSection, cmtBtn) {
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
        renderComments(cmtSection, m, cmtBtn);
        cmtBtn.textContent = `💬 ${m.comments.length}`;
        row.remove();
      } catch { showToast('发送失败'); }
    };
    inp.onkeydown = e => { if (e.key === 'Enter') send.click(); };
    row.appendChild(inp);
    row.appendChild(send);
    return row;
  }

  // ── Lightbox ───────────────────────────────────────────────────────────
  function openLightbox(urls, startIndex) {
    let idx = startIndex;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    const img = document.createElement('img');
    img.className = 'lightbox-img';
    const prev = document.createElement('button');
    prev.className = 'lightbox-btn';  prev.textContent = '‹';
    const next = document.createElement('button');
    next.className = 'lightbox-btn';  next.textContent = '›';
    const close = document.createElement('button');
    close.className = 'lightbox-close';  close.textContent = '✕';
    overlay.append(close, prev, img, next);
    document.body.appendChild(overlay);

    const show = () => { img.src = urls[idx]; prev.style.display = idx > 0 ? '' : 'none'; next.style.display = idx < urls.length - 1 ? '' : 'none'; };
    prev.onclick = () => { idx--; show(); };
    next.onclick = () => { idx++; show(); };
    close.onclick = overlay.onclick = (e) => { if (e.target === overlay || e.target === close) overlay.remove(); };
    show();
  }

  // ── Compose ───────────────────────────────────────────────────────────
  function openCompose() {
    const user = state.user || {};
    const av = avatarEl(user.nickname || user.username || '?', user.avatar, 'compose-user-avatar');

    const modal = document.createElement('div');
    modal.className = 'compose-modal';

    const sheet = document.createElement('div');
    sheet.className = 'compose-sheet';

    // ── Header bar ──────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'compose-header';
    hdr.innerHTML = `
      <button class="compose-cancel-btn" id="compose-cancel">${t('cancel')}</button>
      <span class="compose-title">${t('newMoment')}</span>
      <button class="compose-publish-btn" id="compose-submit" disabled>${t('publish')}</button>
    `;

    // ── User row (avatar + name + textarea) ──────────────────────
    const userRow = document.createElement('div');
    userRow.className = 'compose-user-row';
    userRow.appendChild(av);

    const body = document.createElement('div');
    body.className = 'compose-body';

    const textarea = document.createElement('textarea');
    textarea.id = 'compose-text';
    textarea.className = 'compose-textarea';
    textarea.maxLength = 1024;
    textarea.rows = 4;
    textarea.placeholder = t('momentPlaceholder');
    body.appendChild(textarea);

    // Image preview grid
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'compose-images';
    body.appendChild(imagesDiv);

    userRow.appendChild(body);

    // ── Bottom toolbar ───────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'compose-toolbar';

    const charCount = document.createElement('span');
    charCount.className = 'compose-char-count';
    charCount.textContent = '0 / 1024';

    const photoBtn = document.createElement('button');
    photoBtn.className = 'compose-photo-btn';
    photoBtn.id = 'compose-add-img';
    photoBtn.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span class="compose-photo-count" id="compose-photo-count" style="display:none">0/9</span>
    `;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'compose-file-input';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';

    toolbar.appendChild(charCount);
    toolbar.appendChild(photoBtn);
    toolbar.appendChild(fileInput);

    sheet.appendChild(hdr);
    sheet.appendChild(userRow);
    sheet.appendChild(toolbar);
    modal.appendChild(sheet);
    document.body.appendChild(modal);

    // Animate up
    requestAnimationFrame(() => sheet.classList.add('compose-sheet-open'));

    const submitBtn = modal.querySelector('#compose-submit');
    const photoCount = modal.querySelector('#compose-photo-count');
    let uploadedUrls = [];

    // ── Auto-grow textarea + enable publish ──────────────────────
    textarea.oninput = () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      charCount.textContent = `${textarea.value.length} / 1024`;
      charCount.style.color = textarea.value.length > 900 ? '#FF3B5C' : '';
      updatePublish();
    };

    function updatePublish() {
      const ok = textarea.value.trim().length > 0 || uploadedUrls.length > 0;
      submitBtn.disabled = !ok;
    }

    // ── Close ────────────────────────────────────────────────────
    const dismiss = () => {
      sheet.classList.remove('compose-sheet-open');
      setTimeout(() => modal.remove(), 280);
    };
    modal.querySelector('#compose-cancel').onclick = dismiss;
    modal.addEventListener('click', e => { if (e.target === modal) dismiss(); });

    // ── Photo upload ─────────────────────────────────────────────
    photoBtn.onclick = () => {
      if (uploadedUrls.length >= 9) { showToast('最多选择 9 张图片'); return; }
      fileInput.click();
    };

    fileInput.onchange = async () => {
      const files = Array.from(fileInput.files).slice(0, 9 - uploadedUrls.length);
      for (const file of files) {
        // Placeholder thumb with spinner
        const thumb = document.createElement('div');
        thumb.className = 'compose-thumb compose-thumb-loading';
        thumb.innerHTML = `<div class="compose-thumb-spinner"></div>`;
        imagesDiv.appendChild(thumb);

        try {
          const { url } = await api.upload(file);
          uploadedUrls.push(url);
          thumb.classList.remove('compose-thumb-loading');
          thumb.innerHTML = '';
          const img = document.createElement('img');
          img.src = url;
          const rm = document.createElement('button');
          rm.className = 'compose-thumb-rm';
          rm.innerHTML = '✕';
          rm.onclick = e => {
            e.stopPropagation();
            uploadedUrls = uploadedUrls.filter(u => u !== url);
            thumb.remove();
            updatePhotoCount();
            updatePublish();
          };
          thumb.append(img, rm);
        } catch {
          thumb.remove();
          showToast(t('uploadFailed'));
        }
        updatePhotoCount();
        updatePublish();
      }
      fileInput.value = '';
    };

    function updatePhotoCount() {
      if (uploadedUrls.length > 0) {
        photoCount.style.display = '';
        photoCount.textContent = `${uploadedUrls.length}/9`;
        photoBtn.classList.toggle('compose-photo-btn-active', uploadedUrls.length > 0);
      } else {
        photoCount.style.display = 'none';
        photoBtn.classList.remove('compose-photo-btn-active');
      }
    }

    // ── Publish ──────────────────────────────────────────────────
    submitBtn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text && uploadedUrls.length === 0) { showToast('请输入内容或添加图片'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = t('sendMoment') || '发布中...';
      try {
        await api.createMoment({ text, images: uploadedUrls });
        dismiss();
        setTimeout(() => { exhausted = false; oldestTs = null; loadFeed(false); }, 300);
      } catch {
        showToast(t('opFailed') || '发布失败');
        submitBtn.disabled = false;
        submitBtn.textContent = t('publish');
      }
    };
  }
}
