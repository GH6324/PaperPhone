/**
 * Push Subscription API Routes — PaperPhone
 *
 * POST   /api/push/subscribe    — Save a push subscription
 * DELETE /api/push/subscribe    — Remove a push subscription
 * GET    /api/push/vapid-key    — Get VAPID public key
 */
const express = require('express');
const router  = express.Router();
const { getDb }           = require('../db/mysql');
const { getVapidPublicKey } = require('../services/push');
const { authMiddleware } = require('../middlewares/auth');

// ── Get VAPID Public Key (no auth required) ──────────────────────────────
router.get('/vapid-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// ── Subscribe ────────────────────────────────────────────────────────────
router.post('/subscribe', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const db = getDb();

  // Upsert: if endpoint already exists for this user, update keys
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [userId, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
  );

  res.json({ ok: true });
});

// ── Unsubscribe ──────────────────────────────────────────────────────────
router.delete('/subscribe', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { endpoint } = req.body;

  const db = getDb();
  if (endpoint) {
    await db.query(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );
  } else {
    // Remove all subscriptions for this user
    await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
  }

  res.json({ ok: true });
});

module.exports = router;
