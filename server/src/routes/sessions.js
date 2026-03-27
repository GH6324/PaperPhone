/**
 * Session Management API — PaperPhone
 *
 * GET    /api/sessions       — List all active sessions for current user
 * DELETE /api/sessions/:id   — Revoke a specific session
 * DELETE /api/sessions       — Revoke all sessions except current
 */
const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/mysql');
const { authMiddleware } = require('../middlewares/auth');

// Lazy reference to wsServer (avoid circular require)
let _revokeSessionWs = null;
function getRevokeWs() {
  if (!_revokeSessionWs) {
    try { _revokeSessionWs = require('../ws/wsServer').revokeSessionWs; } catch {}
  }
  return _revokeSessionWs;
}

// ── List Sessions ────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT id, device_name, device_type, os, browser, ip_address, last_active, created_at
       FROM sessions
       WHERE user_id = ? AND revoked = 0
       ORDER BY last_active DESC`,
      [req.user.id]
    );

    // Mark the current session
    const currentSessionId = req.user.session_id || null;
    const sessions = rows.map(r => ({
      ...r,
      is_current: r.id === currentSessionId,
    }));

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

// ── Revoke a Single Session ──────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const userId = req.user.id;

    // Don't let users revoke their own current session via this endpoint
    if (sessionId === req.user.session_id) {
      return res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
    }

    const db = getDb();
    const [result] = await db.query(
      'UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ? AND revoked = 0',
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Force-disconnect via WebSocket
    const revokeFn = getRevokeWs();
    if (revokeFn) revokeFn(userId, sessionId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Revoke All Other Sessions ────────────────────────────────────────────
router.delete('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentSessionId = req.user.session_id;

    if (!currentSessionId) {
      return res.status(400).json({ error: 'Current session has no session_id' });
    }

    const db = getDb();

    // Get list of sessions to revoke (for WS disconnect)
    const [toRevoke] = await db.query(
      'SELECT id FROM sessions WHERE user_id = ? AND revoked = 0 AND id != ?',
      [userId, currentSessionId]
    );

    // Batch revoke
    await db.query(
      'UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0 AND id != ?',
      [userId, currentSessionId]
    );

    // Force-disconnect each via WebSocket
    const revokeFn = getRevokeWs();
    if (revokeFn) {
      for (const { id } of toRevoke) {
        revokeFn(userId, id);
      }
    }

    res.json({ ok: true, revoked: toRevoke.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
