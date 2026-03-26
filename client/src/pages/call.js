/**
 * Call UI — PaperPhone
 * Renders both incoming call overlay and in-call screen.
 * Mount: document.body (covers entire viewport)
 */

import { callManager } from '../services/webrtc.js';
import { avatarEl, showToast } from '../app.js';
import { t } from '../i18n.js';

let _callRoot = null;

// ── Public API ───────────────────────────────────────────────────────────────
export function initCallUI() {
  callManager.onStateChange((state, info) => {
    if (state === 'ringing') renderIncoming(info);
    else if (state === 'calling') renderCalling(info);
    else if (state === 'active')  renderActive(info);
    else if (state === 'idle' || state === 'ended') closeCallUI();
  });
  callManager.onLocalStream(stream => {
    const el = document.getElementById('pp-local-video');
    if (el) el.srcObject = stream;
  });
  callManager.onRemoteStream((peerId, stream) => {
    if (!stream) { removeRemoteVideo(peerId); return; }
    upsertRemoteVideo(peerId, stream, callManager.callInfo);
  });
}

function _mount() {
  if (_callRoot) _callRoot.remove();
  _callRoot = document.createElement('div');
  _callRoot.id = 'pp-call-overlay';
  document.body.appendChild(_callRoot);
  return _callRoot;
}

export function closeCallUI() {
  _callRoot?.remove();
  _callRoot = null;
}

// ── Incoming Call Screen ─────────────────────────────────────────────────────
function renderIncoming(info) {
  const root = _mount();
  const name = info?.name || t('unknownCaller');
  const isVideo = info?.isVideo ?? true;
  const isGroup = info?.isGroup ?? false;

  root.innerHTML = `
    <div class="call-screen call-incoming">
      <div class="call-bg-blur"></div>
      <div class="call-content">
        <div class="call-avatar-wrap" id="inc-av"></div>
        <div class="call-name">${esc(name)}</div>
        <div class="call-subtitle">${isGroup ? t('callGroupIncoming') : (isVideo ? t('callVideoIncoming') : t('callVoiceIncoming'))}</div>

        <div class="call-actions-incoming">
          <button class="call-action-btn call-reject" id="call-reject-btn">
            <svg viewBox="0 0 24 24" fill="white" width="32" height="32">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              <line x1="4" y1="4" x2="20" y2="20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            <span>${t('callReject')}</span>
          </button>
          ${isVideo ? `
          <button class="call-action-btn call-accept-voice" id="call-accept-voice-btn">
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            <span>${t('callAcceptVoice')}</span>
          </button>
          ` : ''}
          <button class="call-action-btn call-accept" id="call-accept-btn">
            <svg viewBox="0 0 24 24" fill="white" width="32" height="32">
              ${isVideo
                ? '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>'
                : '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>'}
            </svg>
            <span>${isVideo ? t('callAcceptVideo') : t('callAccept')}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Avatar
  root.querySelector('#inc-av').appendChild(
    avatarEl(name, null, 'avatar-call')
  );

  // Reject
  root.querySelector('#call-reject-btn').onclick = () => callManager.rejectCall();

  // Accept (video / voice-only)
  root.querySelector('#call-accept-btn').onclick = async () => {
    try {
      await callManager.acceptCall(isVideo);
      await callManager.answerPendingOffer();
    } catch (err) {
      showToast(t('callMediaFailed') + ': ' + err.message);
      callManager.rejectCall();
    }
  };

  const voiceBtn = root.querySelector('#call-accept-voice-btn');
  if (voiceBtn) {
    voiceBtn.onclick = async () => {
      try {
        await callManager.acceptCall(false);
        await callManager.answerPendingOffer();
      } catch (err) {
        showToast(t('callMediaFailed'));
        callManager.rejectCall();
      }
    };
  }
}

// ── Outgoing / Calling Screen ────────────────────────────────────────────────
function renderCalling(info) {
  const root = _mount();
  const name = info?.name || '';
  root.innerHTML = `
    <div class="call-screen call-calling">
      <div class="call-content" style="justify-content:center">
        <div class="call-avatar-wrap" id="out-av" style="margin-bottom:24px"></div>
        <div class="call-name">${esc(name)}</div>
        <div class="call-subtitle call-pulse">${t('callCalling')}</div>
        <div style="margin-top:60px">
          <button class="call-action-btn call-reject" id="call-cancel-btn">
            <svg viewBox="0 0 24 24" fill="white" width="32" height="32">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            <span>${t('callCancel')}</span>
          </button>
        </div>
      </div>
    </div>
  `;
  root.querySelector('#out-av').appendChild(avatarEl(name, null, 'avatar-call'));
  root.querySelector('#call-cancel-btn').onclick = () => {
    callManager.hangup();
  };
}

// ── Active Call Screen ───────────────────────────────────────────────────────
function renderActive(info) {
  const root = _mount();
  const isVideo = info?.isVideo ?? true;
  const name = info?.name || '';
  let callStart = Date.now();
  let muteState = false;
  let cameraOff = false;
  let speakerOn = true;

  root.innerHTML = `
    <div class="call-screen call-active${isVideo ? '' : ' call-voice-only'}">
      <!-- Remote videos grid -->
      <div class="call-remote-grid" id="call-remote-grid">
        ${!isVideo ? `
        <div class="call-voice-avatar" id="voice-avatar-wrap"></div>
        ` : ''}
      </div>

      <!-- Local PiP video -->
      ${isVideo ? `
      <div class="call-pip-wrap" id="call-pip">
        <video id="pp-local-video" autoplay muted playsinline class="call-pip-video"></video>
        <button class="call-pip-switch" id="switch-cam-btn" title="${t('callSwitchCam')}"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg></button>
      </div>
      ` : ''}

      <!-- Top bar: name + timer -->
      <div class="call-topbar">
        <button class="call-topbar-back" id="call-back-btn">⌄</button>
        <div>
          <div class="call-topbar-name">${esc(name)}</div>
          <div class="call-topbar-timer" id="call-timer">00:00</div>
        </div>
        <div style="width:44px"></div>
      </div>

      <!-- Controls -->
      <div class="call-controls">
        <button class="call-ctrl-btn" id="ctrl-mute" title="${t('callMute')}">
          <span class="ctrl-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85A6.01 6.01 0 0 1 11 17.92V20H9v-2.08A6.01 6.01 0 0 1 3.07 11.85c-.08-.49-.49-.85-.97-.85-.61 0-1.07.54-.98 1.14C1.78 16.47 5.5 20 10 20.93V22h4v-1.07c4.5-.93 8.22-4.46 8.88-9A1 1 0 0 0 17.91 11z"/></svg></span>
          <span class="ctrl-label">${t('callMute')}</span>
        </button>
        ${isVideo ? `
        <button class="call-ctrl-btn" id="ctrl-cam" title="${t('callCamera')}">
          <span class="ctrl-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg></span>
          <span class="ctrl-label">${t('callCamera')}</span>
        </button>` : ''}
        <button class="call-ctrl-btn" id="ctrl-speaker" title="${t('callSpeaker')}">
          <span class="ctrl-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-3.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></span>
          <span class="ctrl-label">${t('callSpeaker')}</span>
        </button>
        <button class="call-ctrl-btn call-ctrl-end" id="ctrl-end">
          <span class="ctrl-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg></span>
          <span class="ctrl-label">${t('callEnd')}</span>
        </button>
      </div>
    </div>
  `;

  // Set local video if available
  if (isVideo && callManager.localStream) {
    root.querySelector('#pp-local-video').srcObject = callManager.localStream;
  }

  // Voice mode avatar
  if (!isVideo) {
    root.querySelector('#voice-avatar-wrap')?.appendChild(
      avatarEl(name, null, 'avatar-call-lg')
    );
  }

  // Already-connected remote streams
  callManager.streams.forEach((stream, pid) => {
    upsertRemoteVideo(pid, stream, info);
  });

  // Timer
  const timerEl = root.querySelector('#call-timer');
  const timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - callStart) / 1000);
    timerEl.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, 1000);
  root.querySelector('#ctrl-end').onclick = () => {
    clearInterval(timerInterval);
    callManager.hangup();
  };

  // Mute
  root.querySelector('#ctrl-mute').onclick = function() {
    muteState = callManager.toggleMute() === false;
    this.classList.toggle('ctrl-active', muteState);
    this.querySelector('.ctrl-icon').innerHTML = muteState ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85A6.01 6.01 0 0 1 11 17.92V20H9v-2.08A6.01 6.01 0 0 1 3.07 11.85c-.08-.49-.49-.85-.97-.85-.61 0-1.07.54-.98 1.14C1.78 16.47 5.5 20 10 20.93V22h4v-1.07c4.5-.93 8.22-4.46 8.88-9A1 1 0 0 0 17.91 11z"/></svg>';
    this.querySelector('.ctrl-label').textContent = muteState ? t('callUnmute') : t('callMute');
  };

  // Camera
  root.querySelector('#ctrl-cam')?.addEventListener('click', function() {
    cameraOff = callManager.toggleCamera() === false;
    this.classList.toggle('ctrl-active', cameraOff);
    this.querySelector('.ctrl-icon').innerHTML = cameraOff ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73 3.27 2z"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>';
    this.querySelector('.ctrl-label').textContent = cameraOff ? t('callCameraOff') : t('callCamera');
  });

  // Switch camera (PiP button)
  root.querySelector('#switch-cam-btn')?.addEventListener('click', () => callManager.switchCamera());

  // Speaker (web doesn't support remote audio routing easily; this is a visual toggle)
  root.querySelector('#ctrl-speaker').onclick = function() {
    speakerOn = !speakerOn;
    this.classList.toggle('ctrl-active', !speakerOn);
    this.querySelector('.ctrl-icon').innerHTML = speakerOn ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-3.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>';
  };

  // Minimize / back
  root.querySelector('#call-back-btn').onclick = () => {
    root.querySelector('.call-screen').classList.toggle('call-minimized');
  };
}

// ── Remote Video Helpers ──────────────────────────────────────────────────────
function upsertRemoteVideo(peerId, stream, info) {
  const grid = document.getElementById('call-remote-grid');
  if (!grid) return;
  const id = `rv-${peerId}`;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'call-remote-slot';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.className = 'call-remote-video';
    el.appendChild(video);
    grid.appendChild(el);
  }
  const video = el.querySelector('video');
  if (video) video.srcObject = stream;
  updateGrid(grid);
}

function removeRemoteVideo(peerId) {
  document.getElementById(`rv-${peerId}`)?.remove();
  const grid = document.getElementById('call-remote-grid');
  if (grid) updateGrid(grid);
}

function updateGrid(grid) {
  const count = grid.querySelectorAll('.call-remote-slot').length;
  grid.dataset.count = count;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
