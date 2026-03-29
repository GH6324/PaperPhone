/**
 * Chat Window — i18n v2 + E2EE v2 (stateless per-message ECDH)
 */
import { state, avatarEl, goBack, showToast, formatTime, openGroupInfo } from '../app.js';
import { api } from '../api.js';
import { send, onEvent, offEvent } from '../socket.js';
import { getKey } from '../crypto/keystore.js';
import { encryptMessage, encryptMessageDual, decryptMessage } from '../crypto/ratchet.js';
import { t } from '../i18n.js';
import { callManager } from '../services/webrtc.js';

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function renderChat(root, chat) {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;height:100dvh;';

  // ── Top bar ──────────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <button class="topbar-btn topbar-back" id="back-btn">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
      </svg>
    </button>
    <div class="topbar-title" id="chat-title">${esc(chat.name)}</div>
    <div class="topbar-call-btns">
      ${chat.type === 'group' ? `
      <button class="topbar-btn" id="group-info-btn" title="${t('groupInfo')}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </button>` : ''}
      ${chat.type === 'private' ? `
      <button class="topbar-btn" id="auto-delete-btn" title="${t('autoDeleteTitle')}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
        </svg>
      </button>` : ''}
      <button class="topbar-btn" id="voice-call-btn" title="${t('callVoice')}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.23 1.12.45 2.34.68 3.58.68.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.3 21 3 13.7 3 4.5c0-.55.45-1 1-1H8c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.35.02.74-.22 1.02L6.6 10.8z"/>
        </svg>
      </button>
      ${chat.type === 'private' ? `
      <button class="topbar-btn" id="video-call-btn" title="${t('callVideo')}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
        </svg>
      </button>` : ''}
    </div>
  `;
  root.appendChild(topbar);
  topbar.querySelector('#back-btn').onclick = goBack;

  // Group info button
  topbar.querySelector('#group-info-btn')?.addEventListener('click', () => {
    openGroupInfo(chat.id);
  });

  // Auto-delete button (private chats)
  topbar.querySelector('#auto-delete-btn')?.addEventListener('click', () => {
    const contact = state.contacts.find(c => c.id === chat.id);
    const current = contact?.auto_delete ?? 604800;
    showAutoDeletePicker(current, async (val) => {
      try {
        await api.setAutoDelete(chat.id, val);
        if (contact) contact.auto_delete = val;
        showToast(t('autoDeleteUpdated'));
      } catch (err) { showToast(err.message); }
    });
  });

  // Call buttons
  topbar.querySelector('#voice-call-btn').onclick = async () => {
    if (callManager.state !== 'idle') { showToast(t('callBusy')); return; }
    try {
      await callManager.startCall({
        peerId: chat.id, name: chat.name, avatar: chat.avatar,
        isVideo: false,
        isGroup: chat.type === 'group', groupId: chat.id,
        peerIds: chat.type === 'group' ? (state.contacts.map(c => c.id)) : [],
      });
    } catch (err) { showToast(t('callMediaFailed') + ': ' + err.message); }
  };
  topbar.querySelector('#video-call-btn')?.addEventListener('click', async () => {
    if (callManager.state !== 'idle') { showToast(t('callBusy')); return; }
    try {
      await callManager.startCall({
        peerId: chat.id, name: chat.name, avatar: chat.avatar,
        isVideo: true, isGroup: false,
      });
    } catch (err) { showToast(t('callMediaFailed') + ': ' + err.message); }
  });

  // ── Messages area ────────────────────────────────────────────
  const msgArea = document.createElement('div');
  msgArea.className = 'chat-messages';
  root.appendChild(msgArea);

  // ── Typing indicator ─────────────────────────────────────────
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator hidden';
  typingEl.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  root.appendChild(typingEl);

  // ── Input toolbar ─────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'input-toolbar';
  toolbar.innerHTML = `
    <button class="input-toolbar-btn" id="mic-btn" title="${t('voiceHint')}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85A6.01 6.01 0 0 1 11 17.92V20H9v-2.08A6.01 6.01 0 0 1 3.07 11.85c-.08-.49-.49-.85-.97-.85-.61 0-1.07.54-.98 1.14C1.78 16.47 5.5 20 10 20.93V22h4v-1.07c4.5-.93 8.22-4.46 8.88-9A1 1 0 0 0 17.91 11z"/>
      </svg>
    </button>
    <textarea id="chat-input" rows="1" placeholder="${t('inputPlaceholder')}" aria-label="${t('inputPlaceholder')}"></textarea>
    <button class="input-toolbar-btn" id="emoji-btn" title="Emoji">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
      </svg>
    </button>
    <button class="input-toolbar-btn" id="img-btn" title="${t('uploading')}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
      </svg>
    </button>
    <button class="send-btn hidden" id="send-btn" aria-label="${t('inputPlaceholder')}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    </button>
    <input type="file" id="file-input" accept="image/*,audio/*,video/*" class="hidden">
  `;
  root.appendChild(toolbar);

  // ── Crypto: load my identity key + recipient's bundle (lazily) ────────────
  let myIK = null;         // my identity key (with privateKey)
  let recipientIkPub = null; // cached recipient public key

  async function loadMyKey() {
    if (myIK) return myIK;
    myIK = await getKey('ik');
    if (!myIK) throw new Error(t('noKey'));
    return myIK;
  }

  async function loadRecipientKey() {
    if (recipientIkPub) return recipientIkPub;
    const { ik_pub } = await api.identityKey(chat.id);
    if (!ik_pub) throw new Error('Recipient has no public key registered');
    recipientIkPub = ik_pub;
    return recipientIkPub;
  }

  // ── Decrypt helper (stateless) ────────────────────────────────────────────
  async function tryDecrypt(ciphertext, headerStr) {
    try {
      const ik = await loadMyKey();
      const h = typeof headerStr === 'string' ? JSON.parse(headerStr) : headerStr;
      return await decryptMessage(ik, h, ciphertext);
    } catch {
      return null;
    }
  }

  // ── Render bubble ─────────────────────────────────────────────
  let _msgIdMap = {};
  let _unreadMsgIds = [];

  function addBubble(text, fromMe, ts, msgType = 'text', extra = {}) {
    const row = document.createElement('div');
    row.className = `msg-row ${fromMe ? 'out' : 'in'}`;
    if (extra.msgId) _msgIdMap[extra.msgId] = row;

    let content = '';
    const isSticker = msgType === 'sticker';
    if (msgType === 'image') {
      content = `<img class="bubble-image" src="${esc(extra.url || text)}" alt="image">`;
    } else if (isSticker) {
      content = `<img class="bubble-sticker" src="${esc(extra.url || text)}" alt="sticker">`;
    } else if (msgType === 'voice') {
      content = `<div class="bubble-voice">
        <button class="voice-play-btn" data-src="${esc(extra.url || text)}">▶</button>
        <span class="voice-dur">${extra.duration || '?'}″</span>
      </div>`;
    } else {
      content = esc(text);
    }

    // For group chat incoming messages: show sender avatar + name
    if (!fromMe && chat.type === 'group') {
      const senderAv = avatarEl(extra.senderName || '?', extra.senderAvatar, 'avatar-sm');
      row.appendChild(senderAv);
      const wrapper = document.createElement('div');
      wrapper.className = 'group-bubble-wrap';
      const senderLabel = document.createElement('div');
      senderLabel.className = 'group-sender-name';
      senderLabel.textContent = extra.senderName || '?';
      wrapper.appendChild(senderLabel);
      const bubble = document.createElement('div');
      bubble.className = `bubble${isSticker ? ' sticker-bubble' : ''}`;
      bubble.innerHTML = content;
      wrapper.appendChild(bubble);
      row.appendChild(wrapper);
      if (msgType === 'image') bubble.querySelector('.bubble-image')?.addEventListener('click', e => showImageViewer(e.target.src));
      if (isSticker) bubble.querySelector('.bubble-sticker')?.addEventListener('click', e => showImageViewer(e.target.src));
      if (msgType === 'voice') bubble.querySelector('.voice-play-btn')?.addEventListener('click', e => new Audio(e.currentTarget.dataset.src).play());
    } else {
      if (!fromMe) row.appendChild(avatarEl(chat.name, chat.avatar, 'avatar-sm'));
      const bubble = document.createElement('div');
      bubble.className = `bubble${isSticker ? ' sticker-bubble' : ''}`;
      bubble.innerHTML = content;
      if (msgType === 'image') bubble.querySelector('.bubble-image')?.addEventListener('click', e => showImageViewer(e.target.src));
      if (isSticker) bubble.querySelector('.bubble-sticker')?.addEventListener('click', e => showImageViewer(e.target.src));
      if (msgType === 'voice') bubble.querySelector('.voice-play-btn')?.addEventListener('click', e => new Audio(e.currentTarget.dataset.src).play());
      row.appendChild(bubble);
    }

    const timeEl = document.createElement('div');
    timeEl.className = `bubble-ts${fromMe ? ' bubble-ts-out' : ''}`;
    const d = ts ? new Date(ts) : new Date();
    timeEl.textContent = d.toTimeString().slice(0, 5);
    if (fromMe) {
      const statusEl = document.createElement('span');
      statusEl.className = 'msg-status ' + (extra.read_at ? 'msg-status-read' : 'msg-status-sent');
      statusEl.textContent = extra.read_at ? '✓✓' : '✓';
      if (extra.msgId) statusEl.dataset.ackId = extra.msgId;
      timeEl.appendChild(statusEl);
    }
    row.appendChild(timeEl);

    msgArea.appendChild(row);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  // ── Group chat warning banner ──────────────────────────────────
  if (chat.type === 'group') {
    const banner = document.createElement('div');
    banner.className = 'group-warning-banner';
    banner.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>
      <span>${t('groupChatWarning')}</span>
    `;
    msgArea.appendChild(banner);
  }

  // ── Load history ──────────────────────────────────────────────
  try {
    const history = chat.type === 'group'
      ? await api.groupHistory(chat.id)
      : await api.privateHistory(chat.id);

    for (const row of history) {
      const fromMe = row.from_id === state.user.id;
      let text = t('encryptedMsg');
      let extra = {};

      if (chat.type === 'group') {
        // Group messages are plain text (not encrypted)
        text = row.ciphertext || '';
        if (['image', 'voice', 'file', 'sticker'].includes(row.msg_type)) extra = { url: text };
        extra.senderName = row.from_nickname || '?';
        extra.senderAvatar = row.from_avatar || null;
      } else if (chat.type === 'private' && !fromMe && row.header) {
        const plain = await tryDecrypt(row.ciphertext, row.header);
        if (plain !== null) {
          text = plain;
          if (['image', 'voice', 'file', 'sticker'].includes(row.msg_type)) extra = { url: text };
        }
      } else if (chat.type === 'private' && fromMe && row.self_ciphertext && row.self_header) {
        const plain = await tryDecrypt(row.self_ciphertext, row.self_header);
        if (plain !== null) {
          text = plain;
          if (['image', 'voice', 'file', 'sticker'].includes(row.msg_type)) extra = { url: text };
        }
        if (row.read_at) extra.read_at = row.read_at;
      } else if (fromMe) {
        if (row.read_at) extra.read_at = row.read_at;
      }

      addBubble(text, fromMe, row.created_at, row.msg_type, { ...extra, msgId: row.id });

      // Collect unread incoming messages to mark as read
      if (!fromMe && !row.read_at && row.id) {
        _unreadMsgIds.push(row.id);
      }
    }

    // Batch-send read receipts for all unread incoming messages
    if (_unreadMsgIds.length > 0) {
      send({ type: 'msg_read', msg_ids: _unreadMsgIds });
      _unreadMsgIds = [];
    }
  } catch (e) { /* ignore load errors */ }

  // ── Send message ──────────────────────────────────────────────
  async function sendMessage(text, msgType = 'text', extra = {}) {
    if (msgType === 'text' && !text.trim()) return;

    let ciphertext = text;
    let header = null;
    const msgId = crypto.randomUUID();

    let selfCiphertext = null;
    let selfHeader = null;

    if (chat.type === 'private') {
      try {
        const ikPub = await loadRecipientKey();
        const myKey = await loadMyKey();
        const res = await encryptMessageDual(ikPub, myKey.publicKey, text);
        ciphertext = res.ciphertext;
        header = JSON.stringify(res.header);
        selfCiphertext = res.self_ciphertext;
        selfHeader = JSON.stringify(res.self_header);
      } catch (err) {
        console.error('[E2EE] encryptMessage failed:', err);
        showToast(`${t('encFailed')}: ${err.message}`, 4000);
        return;
      }
    }
    // Group messages: no encryption, send plain text as ciphertext field

    addBubble(text, true, Date.now(), msgType, { msgId, ...extra });
    send({
      type: 'message',
      to: chat.type === 'private' ? chat.id : undefined,
      group_id: chat.type === 'group' ? chat.id : undefined,
      msg_type: msgType, ciphertext, header,
      self_ciphertext: selfCiphertext,
      self_header: selfHeader,
      client_id: msgId,
    });
    const c = state.chats.find(s => s.id === chat.id);
    if (c) { c.lastMsg = msgType === 'text' ? text : (msgType === 'sticker' ? '[Sticker]' : t('imageLabel')); c.lastTs = Date.now(); }
  }

  // ── Input events ──────────────────────────────────────────────
  const inputEl = toolbar.querySelector('#chat-input');
  const sendBtn = toolbar.querySelector('#send-btn');
  const emojiBtn = toolbar.querySelector('#emoji-btn');
  const imgBtn = toolbar.querySelector('#img-btn');
  const fileInput = toolbar.querySelector('#file-input');

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
    const hasText = !!inputEl.value.trim();
    sendBtn.classList.toggle('hidden', !hasText);
    emojiBtn.classList.toggle('hidden', hasText);
    clearTimeout(inputEl._typingTimer);
    if (hasText) {
      send({ type: 'typing',
        to: chat.type === 'private' ? chat.id : undefined,
        group_id: chat.type === 'group' ? chat.id : undefined,
      });
      inputEl._typingTimer = setTimeout(() => {}, 3000);
    }
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (text) { sendMessage(text); inputEl.value = ''; inputEl.style.height = 'auto'; sendBtn.classList.add('hidden'); emojiBtn.classList.remove('hidden'); }
    }
  });
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (text) { sendMessage(text); inputEl.value = ''; inputEl.style.height = 'auto'; sendBtn.classList.add('hidden'); emojiBtn.classList.remove('hidden'); }
  });

  // Image upload
  imgBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      showToast(t('uploading'));
      const { url } = await api.upload(file);
      const isImg = file.type.startsWith('image');
      sendMessage(url, isImg ? 'image' : 'file', { url });
    } catch { showToast(t('uploadFailed')); }
    fileInput.value = '';
  });

  // Voice recording
  let mediaRec, recChunks = [], recStart, voiceOverlay = null;
  const micBtn = toolbar.querySelector('#mic-btn');
  micBtn.addEventListener('mousedown', startVoice);
  micBtn.addEventListener('touchstart', e => { e.preventDefault(); startVoice(); }, { passive: false });
  document.addEventListener('mouseup', stopVoice);
  document.addEventListener('touchend', stopVoice);

  async function startVoice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRec = new MediaRecorder(stream);
      recChunks = []; recStart = Date.now();
      mediaRec.ondataavailable = e => recChunks.push(e.data);
      mediaRec.start();
      voiceOverlay = document.createElement('div');
      voiceOverlay.className = 'voice-overlay';
      voiceOverlay.innerHTML = `<div class="voice-pulse"><svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85A6.01 6.01 0 0 1 11 17.92V20H9v-2.08A6.01 6.01 0 0 1 3.07 11.85c-.08-.49-.49-.85-.97-.85-.61 0-1.07.54-.98 1.14C1.78 16.47 5.5 20 10 20.93V22h4v-1.07c4.5-.93 8.22-4.46 8.88-9A1 1 0 0 0 17.91 11z"/></svg></div><p>${t('voiceHint')}</p>`;
      document.body.appendChild(voiceOverlay);
    } catch { showToast(t('micFailed')); }
  }
  async function stopVoice() {
    if (!mediaRec || mediaRec.state === 'inactive') return;
    mediaRec.stop();
    voiceOverlay?.remove(); voiceOverlay = null;
    const duration = Math.round((Date.now() - recStart) / 1000);
    mediaRec.onstop = async () => {
      const blob = new Blob(recChunks, { type: 'audio/webm' });
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      try {
        showToast(t('sendingVoice'));
        const { url } = await api.upload(file);
        sendMessage(url, 'voice', { url, duration });
      } catch { showToast(t('uploadFailed')); }
    };
    mediaRec.stream.getTracks().forEach(t => t.stop());
  }

  // ═══ Emoji / Sticker Panel ═══════════════════════════════════════
  const EMOJI_CATEGORIES = [
    { icon: '😊', label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫡','🤫','🤔','🫠','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥶','🥵','😱','😨','😰','😥','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
    { icon: '👋', label: 'Gestures', emojis: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄'] },
    { icon: '❤️', label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫀','💋','💌','💐','🌹','🥀','🌷','🌸','🌺','🌻','🌼','💎','✨','🌟','⭐','🔥','💫','⚡','☀️','🌈'] },
    { icon: '🎉', label: 'Celebrate', emojis: ['🎉','🎊','🎈','🎁','🎀','🎗️','🏆','🏅','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🎿','🏂','🏋️','🤸','⛹️','🤾','🚴','🏊','🤽','🧗','🏄','🎮','🎯','🎲','🎰','🎵','🎶','🎤','🎸','🎹','🎺','🎻','🥁','📸','🎬','🎨'] },
    { icon: '🐱', label: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦄','🐴','🫏','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🪳','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'] },
    { icon: '🍔', label: 'Food', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🫔','🥙','🧆','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🎂','🍰','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍼','🥤','☕','🍵','🧃','🍶','🍺','🍷','🥂','🍹'] },
    { icon: '🚀', label: 'Travel', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','🛼','🚁','🛸','🚀','✈️','🛩️','🛰️','🚢','⛵','🛥️','🚤','⛴️','🏠','🏡','🏢','🏬','🏭','🏗️','🗼','🗽','⛪','🕌','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🌆','🌇','🌉','🌌','🎠','🎡','🎢','🏖️','🏝️','🏰','🗻','🌋'] },
    { icon: '💡', label: 'Objects', emojis: ['💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📹','🎥','📞','☎️','📺','📻','🎙️','⏰','⌚','📡','🔋','🪫','🔌','💰','💸','💳','💎','⚖️','🔧','🪛','🔨','⛏️','🪚','🔩','⚙️','🧲','🔬','🔭','📡','💉','💊','🩹','🩺','🚪','🪞','🛏️','🪑','🚽','🧹','🧺','🧼','📦','📮','📬','📨','📩','📝','📁','📂','📅','📆','📎','📌','📍','✂️','🔒','🔓','🗝️','🔑'] },
  ];

  // Sticker packs — fetched dynamically from server config
  let _stickerPacksList = null; // cached after first fetch
  async function getStickerPacks() {
    if (_stickerPacksList) return _stickerPacksList;
    try {
      const { packs } = await api.stickerPacks();
      _stickerPacksList = packs || [];
    } catch {
      // Fallback to empty if server is unreachable
      _stickerPacksList = [];
    }
    return _stickerPacksList;
  }

  const RECENT_KEY = 'pp_recent_emoji';
  function getRecentEmojis() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
  function addRecentEmoji(em) {
    let recent = getRecentEmojis().filter(e => e !== em);
    recent.unshift(em);
    if (recent.length > 24) recent = recent.slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  let emojiPanel = null;
  let _stickerCache = {};   // packName → stickers[]
  let _currentTab = 'emoji';
  let _currentCat = 0;
  let _currentPack = 0;

  emojiBtn.addEventListener('click', () => {
    if (emojiPanel) { closePanel(); return; }
    openPanel();
  });

  function closePanel() {
    if (!emojiPanel) return;
    emojiPanel.classList.add('esp-closing');
    emojiPanel.addEventListener('animationend', () => {
      emojiPanel?.remove();
      emojiPanel = null;
    }, { once: true });
  }

  function openPanel() {
    emojiPanel = document.createElement('div');
    emojiPanel.className = 'esp-panel';
    const toolbarRect = toolbar.getBoundingClientRect();
    emojiPanel.style.bottom = `${window.innerHeight - toolbarRect.top}px`;

    // ── Content area (swapped by tabs) ──
    const contentWrap = document.createElement('div');
    contentWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;';

    // ── Bottom tabs ──
    const tabBar = document.createElement('div');
    tabBar.className = 'esp-tabs';

    const indicator = document.createElement('div');
    indicator.className = 'esp-tab-indicator';
    tabBar.appendChild(indicator);

    const emojiTabBtn = document.createElement('button');
    emojiTabBtn.className = 'esp-tab active';
    emojiTabBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>Emoji`;

    const stickerTabBtn = document.createElement('button');
    stickerTabBtn.className = 'esp-tab';
    stickerTabBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21.796 9.982C20.849 5.357 16.729 2 12 2 6.486 2 2 6.486 2 12c0 4.729 3.357 8.849 7.982 9.796a.988.988 0 0 0 .908-.272l10.634-10.634a.988.988 0 0 0 .272-.908zM11 19.929A8.012 8.012 0 0 1 4 12c0-4.411 3.589-8 8-8 3.7 0 6.867 2.543 7.929 6H15c-1.654 0-3 1.346-3 3v4.929z"/></svg>Stickers`;

    tabBar.appendChild(emojiTabBtn);
    tabBar.appendChild(stickerTabBtn);

    emojiPanel.appendChild(contentWrap);
    emojiPanel.appendChild(tabBar);
    document.body.appendChild(emojiPanel);

    // Position indicator
    requestAnimationFrame(() => {
      updateIndicator(emojiTabBtn);
    });

    function updateIndicator(btn) {
      const r = btn.getBoundingClientRect();
      const p = tabBar.getBoundingClientRect();
      indicator.style.left = (r.left - p.left) + 'px';
      indicator.style.width = r.width + 'px';
    }

    // Tab switching
    emojiTabBtn.onclick = () => {
      if (_currentTab === 'emoji') return;
      _currentTab = 'emoji';
      emojiTabBtn.classList.add('active');
      stickerTabBtn.classList.remove('active');
      updateIndicator(emojiTabBtn);
      renderEmojiContent();
    };
    stickerTabBtn.onclick = () => {
      if (_currentTab === 'sticker') return;
      _currentTab = 'sticker';
      stickerTabBtn.classList.add('active');
      emojiTabBtn.classList.remove('active');
      updateIndicator(stickerTabBtn);
      renderStickerContent();
    };

    // ═══ Emoji Content ═══
    function renderEmojiContent() {
      contentWrap.innerHTML = '';
      // Category bar
      const catBar = document.createElement('div');
      catBar.className = 'esp-categories';

      // Clock icon for recent
      const recentBtn = document.createElement('button');
      recentBtn.className = `esp-cat-btn${_currentCat === -1 ? ' active' : ''}`;
      recentBtn.textContent = '🕐';
      recentBtn.title = 'Recent';
      recentBtn.onclick = () => {
        _currentCat = -1;
        showCategory(-1);
        catBar.querySelectorAll('.esp-cat-btn').forEach(b => b.classList.remove('active'));
        recentBtn.classList.add('active');
      };
      catBar.appendChild(recentBtn);

      EMOJI_CATEGORIES.forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className = `esp-cat-btn${_currentCat === i ? ' active' : ''}`;
        btn.textContent = cat.icon;
        btn.title = cat.label;
        btn.onclick = () => {
          _currentCat = i;
          showCategory(i);
          catBar.querySelectorAll('.esp-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        };
        catBar.appendChild(btn);
      });
      contentWrap.appendChild(catBar);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'esp-grid';
      contentWrap.appendChild(grid);

      function showCategory(idx) {
        grid.innerHTML = '';
        if (idx === -1) {
          const recent = getRecentEmojis();
          if (recent.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'esp-recent-label';
            empty.textContent = 'No recent emojis';
            empty.style.color = 'var(--text-muted)';
            empty.style.textAlign = 'center';
            empty.style.padding = '32px 0';
            grid.appendChild(empty);
            return;
          }
          const lbl = document.createElement('div');
          lbl.className = 'esp-recent-label';
          lbl.textContent = 'RECENTLY USED';
          grid.appendChild(lbl);
          recent.forEach(em => addEmojiToGrid(em, grid));
        } else {
          EMOJI_CATEGORIES[idx].emojis.forEach(em => addEmojiToGrid(em, grid));
        }
      }

      showCategory(_currentCat >= 0 ? _currentCat : -1);
    }

    function addEmojiToGrid(em, grid) {
      const btn = document.createElement('button');
      btn.className = 'esp-emoji-btn';
      btn.textContent = em;
      btn.onclick = () => {
        inputEl.value += em;
        inputEl.dispatchEvent(new Event('input'));
        addRecentEmoji(em);
        closePanel();
      };
      grid.appendChild(btn);
    }

    // ═══ Sticker Content ═══
    async function renderStickerContent() {
      contentWrap.innerHTML = '';

      // Pack tabs bar
      const packBar = document.createElement('div');
      packBar.className = 'esp-sticker-packs';
      contentWrap.appendChild(packBar);

      // Sticker grid
      const stickerGrid = document.createElement('div');
      stickerGrid.className = 'esp-sticker-grid';
      contentWrap.appendChild(stickerGrid);

      // Show loading while fetching pack list
      stickerGrid.innerHTML = '<div class="esp-sticker-status"><div class="esp-spinner"></div><span>Loading packs...</span></div>';

      const STICKER_PACKS = await getStickerPacks();
      stickerGrid.innerHTML = '';

      if (STICKER_PACKS.length === 0) {
        stickerGrid.innerHTML = '<div class="esp-sticker-status"><span style="font-size:24px">📭</span><span>No sticker packs configured</span></div>';
        return;
      }

      // Clamp _currentPack to valid range
      if (_currentPack >= STICKER_PACKS.length) _currentPack = 0;

      STICKER_PACKS.forEach((pack, i) => {
        const btn = document.createElement('button');
        btn.className = `esp-pack-btn${_currentPack === i ? ' active' : ''}`;
        btn.textContent = pack.label;
        btn.onclick = () => {
          _currentPack = i;
          packBar.querySelectorAll('.esp-pack-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadStickerPack(pack.name, stickerGrid);
        };
        packBar.appendChild(btn);
      });

      loadStickerPack(STICKER_PACKS[_currentPack].name, stickerGrid);
    }

    async function loadStickerPack(packName, grid) {
      grid.innerHTML = '';

      // Check cache
      if (_stickerCache[packName]) {
        renderStickers(_stickerCache[packName], grid);
        return;
      }

      // Show loading
      const loading = document.createElement('div');
      loading.className = 'esp-sticker-status';
      loading.innerHTML = '<div class="esp-spinner"></div><span>Loading stickers...</span>';
      grid.appendChild(loading);

      try {
        const data = await api.stickerSet(packName);
        _stickerCache[packName] = data.stickers || [];
        grid.innerHTML = '';
        renderStickers(_stickerCache[packName], grid);
      } catch (err) {
        grid.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'esp-sticker-status';
        errEl.innerHTML = `<span style="font-size:24px">😢</span><span>${err.message || 'Failed to load stickers'}</span>`;
        grid.appendChild(errEl);
      }
    }

    function renderStickers(stickers, grid) {
      const staticStickers = stickers.filter(s => !s.is_animated && !s.is_video);
      if (staticStickers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'esp-sticker-status';
        empty.innerHTML = '<span style="font-size:24px">📭</span><span>No static stickers in this pack</span>';
        grid.appendChild(empty);
        return;
      }

      staticStickers.forEach(sticker => {
        const item = document.createElement('div');
        item.className = 'esp-sticker-item loading';
        const img = document.createElement('img');
        const fileId = sticker.thumb_file_id || sticker.file_id;
        img.src = api.stickerFileUrl(fileId);
        img.alt = sticker.emoji || 'sticker';
        img.loading = 'lazy';
        img.onload = () => item.classList.remove('loading');
        img.onerror = () => {
          item.classList.remove('loading');
          item.innerHTML = '<span style="font-size:20px;opacity:.4">✕</span>';
        };
        item.appendChild(img);
        item.onclick = () => {
          // Send sticker as image message with full-res file
          const fullUrl = api.stickerFileUrl(sticker.file_id);
          sendMessage(fullUrl, 'sticker', { url: fullUrl });
          closePanel();
        };
        grid.appendChild(item);
      });
    }

    // Initial render
    if (_currentTab === 'emoji') renderEmojiContent();
    else renderStickerContent();
  }

  // ── Incoming messages ─────────────────────────────────────────
  async function handleIncoming(msg) {
    const matchId = msg.group_id || msg.from;
    if (matchId !== chat.id) return;

    let text = msg.ciphertext; // fallback: show raw for groups
    let extra = {};

    if (chat.type === 'group') {
      // Group messages are plain text
      text = msg.ciphertext || '';
      if (['image', 'voice', 'file', 'sticker'].includes(msg.msg_type)) extra = { url: text };
      extra.senderName = msg.from_nickname || '?';
      extra.senderAvatar = msg.from_avatar || null;
    } else if (chat.type === 'private' && msg.header && msg.ciphertext) {
      const plain = await tryDecrypt(msg.ciphertext, msg.header);
      if (plain !== null) {
        text = plain;
        if (['image', 'voice', 'file', 'sticker'].includes(msg.msg_type)) extra = { url: text };
      } else {
        text = t('encryptedMsg');
      }
    }

    addBubble(text, false, msg.ts, msg.msg_type || 'text', extra);
    const c = state.chats.find(s => s.id === chat.id);
    if (c) c.lastTs = msg.ts;

    // Immediately mark as read since chat is open
    if (msg.id) {
      send({ type: 'msg_read', msg_ids: [msg.id] });
    }
  }

  onEvent('message', handleIncoming);

  // Handle ack
  onEvent('ack', ({ msg_id }) => {
    const statusEl = document.querySelector(`[data-ack-id="${CSS.escape(msg_id)}"]`);
    if (statusEl) {
      statusEl.textContent = '✓✓';
      statusEl.classList.replace('msg-status-sent', 'msg-status-delivered');
    }
  });

  // Handle read receipts from recipient
  function handleMsgRead({ msg_ids }) {
    if (!Array.isArray(msg_ids)) return;
    for (const id of msg_ids) {
      const statusEl = document.querySelector(`[data-ack-id="${CSS.escape(id)}"]`);
      if (statusEl) {
        statusEl.textContent = '✓✓';
        statusEl.className = 'msg-status msg-status-read';
      }
    }
  }
  onEvent('msg_read', handleMsgRead);

  let typingTimer;
  onEvent('typing', ({ from }) => {
    if (from !== chat.id) return;
    typingEl.classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => typingEl.classList.add('hidden'), 3000);
  });

  root._cleanup = () => {
    offEvent('message', handleIncoming);
    offEvent('msg_read', handleMsgRead);
    clearTimeout(typingTimer);
    voiceOverlay?.remove();
    if (emojiPanel) { emojiPanel.remove(); emojiPanel = null; }
    document.removeEventListener('mouseup', stopVoice);
    document.removeEventListener('touchend', stopVoice);
  };
}

function showImageViewer(src) {
  const viewer = document.createElement('div');
  viewer.className = 'img-viewer';
  viewer.innerHTML = `
    <div class="img-viewer-close"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
    <img src="${src}" alt="image">
  `;
  viewer.querySelector('.img-viewer-close').onclick = () => viewer.remove();
  viewer.onclick = e => { if (e.target === viewer) viewer.remove(); };
  document.body.appendChild(viewer);
}

function showAutoDeletePicker(current, onSelect) {
  const options = [
    { value: 0,       label: t('autoDeleteNever') },
    { value: 86400,   label: t('autoDelete1d') },
    { value: 259200,  label: t('autoDelete3d') },
    { value: 604800,  label: t('autoDelete7d') },
    { value: 2592000, label: t('autoDelete30d') },
  ];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" style="width:85%;max-width:360px;">
      <div class="modal-header">
        <div style="min-width:44px"></div>
        <div class="topbar-title" style="font-size:16px">${t('autoDeleteTitle')}</div>
        <div style="min-width:44px"></div>
      </div>
      <div id="ad-options" style="padding:8px 0;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const list = overlay.querySelector('#ad-options');
  options.forEach(opt => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.style.cssText = 'cursor:pointer;justify-content:space-between;padding:14px 20px;';
    const isActive = current === opt.value;
    row.innerHTML = `
      <span style="font-size:15px;font-weight:${isActive ? '600' : '400'};color:${isActive ? 'var(--green)' : 'var(--text)'};">${opt.label}</span>
      ${isActive ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="var(--green)"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' : ''}
    `;
    row.onclick = () => {
      overlay.remove();
      if (opt.value !== current) onSelect(opt.value);
    };
    list.appendChild(row);
  });
}
