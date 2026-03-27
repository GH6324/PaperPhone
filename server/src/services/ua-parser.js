/**
 * Lightweight User-Agent parser — no external dependencies.
 * Extracts device_name, device_type, os, browser from a UA string.
 */

function parseUA(ua) {
  if (!ua) return { device_name: 'Unknown', device_type: 'desktop', os: null, browser: null };

  let os = null;
  let browser = null;
  let device_type = 'desktop';

  // ── OS Detection ─────────────────────────────────────────────────────
  if (/iPhone/.test(ua)) {
    const m = ua.match(/iPhone OS (\d+[_.\d]*)/);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
    device_type = 'mobile';
  } else if (/iPad/.test(ua)) {
    const m = ua.match(/CPU OS (\d+[_.\d]*)/);
    os = m ? `iPadOS ${m[1].replace(/_/g, '.')}` : 'iPadOS';
    device_type = 'tablet';
  } else if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+[.\d]*)/);
    os = m ? `Android ${m[1]}` : 'Android';
    device_type = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  } else if (/Windows NT/.test(ua)) {
    const ver = ua.match(/Windows NT (\d+\.\d+)/);
    const map = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    os = ver ? `Windows ${map[ver[1]] || ver[1]}` : 'Windows';
  } else if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[_.\d]*)/);
    os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  } else if (/CrOS/.test(ua)) {
    os = 'ChromeOS';
  }

  // ── Browser Detection ────────────────────────────────────────────────
  if (/Edg\//.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/);
    browser = m ? `Edge ${m[1]}` : 'Edge';
  } else if (/OPR\//.test(ua) || /Opera/.test(ua)) {
    const m = ua.match(/OPR\/(\d+)/);
    browser = m ? `Opera ${m[1]}` : 'Opera';
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/);
    browser = m ? `Chrome ${m[1]}` : 'Chrome';
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    const m = ua.match(/Version\/(\d+[.\d]*)/);
    browser = m ? `Safari ${m[1]}` : 'Safari';
  } else if (/Firefox\//.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/);
    browser = m ? `Firefox ${m[1]}` : 'Firefox';
  }

  // ── Device Name ──────────────────────────────────────────────────────
  const parts = [os, browser].filter(Boolean);
  const device_name = parts.length ? parts.join(' · ') : 'Unknown Device';

  return { device_name, device_type, os, browser };
}

module.exports = { parseUA };
