const jwt = require('jsonwebtoken');
const { getDb } = require('../db/mysql');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Throttle last_active updates: at most once every 5 minutes per session
const _lastActiveUpdated = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;

    // If JWT contains session_id, verify it hasn't been revoked
    if (payload.session_id) {
      const db = getDb();
      db.query(
        'SELECT revoked FROM sessions WHERE id = ? AND user_id = ?',
        [payload.session_id, payload.id]
      ).then(([rows]) => {
        if (rows.length === 0 || rows[0].revoked === 1) {
          return res.status(401).json({ error: 'Session revoked' });
        }

        // Throttled last_active update
        const lastUpdated = _lastActiveUpdated.get(payload.session_id) || 0;
        if (Date.now() - lastUpdated > THROTTLE_MS) {
          _lastActiveUpdated.set(payload.session_id, Date.now());
          db.query('UPDATE sessions SET last_active = NOW() WHERE id = ?', [payload.session_id])
            .catch(() => {}); // fire-and-forget
        }

        next();
      }).catch(() => {
        // DB error — let the request through (graceful degradation)
        next();
      });
    } else {
      // Old JWT without session_id — backward compatible, skip check
      next();
    }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, authMiddleware };
