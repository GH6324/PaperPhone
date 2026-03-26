/**
 * Discover page — i18n v2
 */
import { t } from '../i18n.js';
import { state } from '../app.js';
import { renderMoments } from './moments.js';

export function renderDiscover(root) {
  root.innerHTML = `
    <div class="topbar">
      <div style="min-width:44px"></div>
      <div class="topbar-title">${t('discoverTitle')}</div>
      <div style="min-width:44px"></div>
    </div>
    <div style="padding:16px 0">
      <div class="discover-group">
        <div class="discover-item" id="moments-item">
          <div class="discover-icon" style="background:#07C160"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg></div>
          <span class="discover-label">${t('moments')}</span>
          <span class="discover-chevron">›</span>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#moments-item').addEventListener('click', () => {
    renderMoments(root);
  });
}
