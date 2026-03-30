const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/mysql');
const { authMiddleware, signToken } = require('../middlewares/auth');
const { parseUA } = require('../services/ua-parser');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Generate a TOTP instance for a user */
function createTOTP(secret, username) {
  return new TOTP({
    issuer: 'PaperPhone',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/** Generate a new base32 secret */
function generateSecret() {
  return new Secret({ size: 20 }).base32;
}

/** Generate 8 random recovery codes */
function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    // format: XXXX-XXXX (alphanumeric, easy to read)
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

/** Hash recovery codes with bcrypt */
async function hashRecoveryCodes(codes) {
  const hashed = [];
  for (const code of codes) {
    hashed.push(await bcrypt.hash(code.replace('-', ''), 8));
  }
  return hashed;
}

// ── Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/totp/status — Check if 2FA is enabled
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      'SELECT enabled FROM user_totp WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ enabled: rows.length > 0 && rows[0].enabled === 1 });
  } catch (err) { next(err); }
});

/**
 * POST /api/totp/setup — Start 2FA setup (generate secret + QR)
 */
router.post('/setup', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();

    // Check if already enabled
    const [existing] = await db.query(
      'SELECT enabled FROM user_totp WHERE user_id = ?',
      [req.user.id]
    );
    if (existing.length > 0 && existing[0].enabled === 1) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Generate or reuse secret (in setup phase)
    let secret;
    if (existing.length > 0) {
      // Re-generate secret if in setup phase
      secret = generateSecret();
      await db.query(
        'UPDATE user_totp SET totp_secret = ?, created_at = NOW() WHERE user_id = ?',
        [secret, req.user.id]
      );
    } else {
      secret = generateSecret();
      await db.query(
        'INSERT INTO user_totp (user_id, totp_secret) VALUES (?, ?)',
        [req.user.id, secret]
      );
    }

    // Build OTP Auth URI
    const totp = createTOTP(secret, req.user.username);
    const uri = totp.toString();

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    res.json({ secret, qrDataUrl, uri });
  } catch (err) { next(err); }
});

/**
 * POST /api/totp/verify-setup — Verify initial code & activate 2FA
 * Body: { code: "123456" }
 */
router.post('/verify-setup', authMiddleware, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const db = getDb();
    const [rows] = await db.query(
      'SELECT totp_secret, enabled FROM user_totp WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Setup not started' });
    if (rows[0].enabled === 1) return res.status(400).json({ error: '2FA already enabled' });

    // Verify the TOTP code
    const totp = createTOTP(rows[0].totp_secret, req.user.username);
    const delta = totp.validate({ token: code.trim(), window: 1 });
    if (delta === null) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Generate recovery codes
    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = await hashRecoveryCodes(recoveryCodes);

    // Activate
    await db.query(
      'UPDATE user_totp SET enabled = 1, recovery_codes = ? WHERE user_id = ?',
      [JSON.stringify(hashedCodes), req.user.id]
    );

    res.json({ success: true, recoveryCodes });
  } catch (err) { next(err); }
});

/**
 * POST /api/totp/disable — Disable 2FA
 * Body: { code: "123456" }
 */
router.post('/disable', authMiddleware, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const db = getDb();
    const [rows] = await db.query(
      'SELECT totp_secret FROM user_totp WHERE user_id = ? AND enabled = 1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(400).json({ error: '2FA not enabled' });

    const totp = createTOTP(rows[0].totp_secret, req.user.username);
    const delta = totp.validate({ token: code.trim(), window: 1 });
    if (delta === null) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    await db.query('DELETE FROM user_totp WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * POST /api/totp/verify-login — Verify TOTP during login (uses temp 2fa_pending token)
 * Body: { code: "123456", login_token: "..." }
 */
router.post('/verify-login', async (req, res, next) => {
  try {
    const { code, login_token } = req.body;
    if (!code || !login_token) {
      return res.status(400).json({ error: 'Code and login_token required' });
    }

    // Verify the temporary token
    let payload;
    try {
      payload = jwt.verify(login_token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Expired or invalid login token' });
    }
    if (payload.type !== '2fa_pending') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const db = getDb();
    const [rows] = await db.query(
      'SELECT totp_secret, recovery_codes FROM user_totp WHERE user_id = ? AND enabled = 1',
      [payload.id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: '2FA not configured' });
    }

    const cleanCode = code.trim().replace('-', '');
    let valid = false;

    // Try TOTP code first (6 digits)
    if (/^\d{6}$/.test(cleanCode)) {
      const totp = createTOTP(rows[0].totp_secret, payload.username);
      const delta = totp.validate({ token: cleanCode, window: 1 });
      valid = delta !== null;
    }

    // Try recovery code if TOTP didn't match
    if (!valid && rows[0].recovery_codes) {
      const hashedCodes = JSON.parse(rows[0].recovery_codes);
      for (let i = 0; i < hashedCodes.length; i++) {
        if (hashedCodes[i] && await bcrypt.compare(cleanCode.toUpperCase(), hashedCodes[i])) {
          // Consume the recovery code
          hashedCodes[i] = null;
          await db.query(
            'UPDATE user_totp SET recovery_codes = ? WHERE user_id = ?',
            [JSON.stringify(hashedCodes), payload.id]
          );
          valid = true;
          break;
        }
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // 2FA passed — create real session & JWT
    const sessionId = uuidv4();
    const ua = req.headers['user-agent'] || '';
    const { device_name, device_type, os, browser } = parseUA(ua);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

    await db.query(
      `INSERT INTO sessions (id, user_id, device_name, device_type, os, browser, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, payload.id, device_name, device_type, os, browser, ip]
    );

    const token = signToken({ id: payload.id, username: payload.username, session_id: sessionId });

    // Fetch user info
    const [userRows] = await db.query(
      'SELECT id, username, nickname, avatar FROM users WHERE id = ?',
      [payload.id]
    );

    res.json({ token, user: userRows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
