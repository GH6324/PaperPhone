const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/mysql');
const { signToken } = require('../middlewares/auth');
const { parseUA } = require('../services/ua-parser');

const router = express.Router();

/**
 * Create a session record and return a JWT with embedded session_id.
 */
async function createSession(userId, username, req) {
  const db = getDb();
  const sessionId = uuidv4();

  const ua = req.headers['user-agent'] || '';
  const { device_name, device_type, os, browser } = parseUA(ua);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

  await db.query(
    `INSERT INTO sessions (id, user_id, device_name, device_type, os, browser, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, device_name, device_type, os, browser, ip]
  );

  const token = signToken({ id: userId, username, session_id: sessionId });
  return { token, sessionId };
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, nickname, password, ik_pub, spk_pub, spk_sig, kem_pub, prekeys } = req.body;
    if (!username || !password || !ik_pub || !spk_pub || !spk_sig || !kem_pub) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDb();
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await db.query(
      `INSERT INTO users (id, username, nickname, password, ik_pub, spk_pub, spk_sig, kem_pub)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, nickname || username, hash, ik_pub, spk_pub, spk_sig, kem_pub]
    );

    // Upload one-time prekeys (OPKs)
    if (Array.isArray(prekeys) && prekeys.length > 0) {
      const rows = prekeys.map(pk => [id, pk.key_id, pk.opk_pub]);
      await db.query('INSERT INTO prekeys (user_id, key_id, opk_pub) VALUES ?', [rows]);
    }

    const { token } = await createSession(id, username, req);
    res.status(201).json({ token, user: { id, username, nickname: nickname || username } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const db = getDb();
    const [rows] = await db.query(
      'SELECT id, username, nickname, avatar, password FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if 2FA is enabled
    const [totpRows] = await db.query(
      'SELECT enabled FROM user_totp WHERE user_id = ? AND enabled = 1',
      [user.id]
    );

    if (totpRows.length > 0) {
      // 2FA enabled — issue a short-lived pending token
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
      const loginToken = jwt.sign(
        { id: user.id, username: user.username, type: '2fa_pending' },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requires_2fa: true, login_token: loginToken });
    }

    delete user.password;
    const { token } = await createSession(user.id, user.username, req);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
