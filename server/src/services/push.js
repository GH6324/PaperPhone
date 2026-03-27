/**
 * Web Push Notification Service — PaperPhone
 *
 * Uses VAPID protocol for both Android (Chrome/Edge/Firefox)
 * and iOS (Safari 16.4+ PWA).
 */
const webPush = require('web-push');
const { getDb } = require('../db/mysql');

// ── VAPID Setup ──────────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT     || 'mailto:admin@paperphone.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('✅ Web Push VAPID configured');
} else {
  console.warn('⚠️  VAPID keys not set — push notifications disabled');
}

/**
 * Send a push notification to a single subscription object.
 * Automatically removes expired/invalid subscriptions (410 Gone).
 */
async function sendPush(subscription, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;

  const pushSub = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth:   subscription.auth,
    },
  };

  try {
    await webPush.sendNotification(pushSub, JSON.stringify(payload), {
      TTL: 60 * 60,          // 1 hour
      urgency: 'high',
    });
    return true;
  } catch (err) {
    // 404 or 410 = subscription no longer valid → remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      const db = getDb();
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
      console.log('🗑️  Removed expired push subscription');
    } else {
      console.error('Push send error:', err.statusCode || err.message);
    }
    return false;
  }
}

/**
 * Send push notifications to ALL subscriptions for a given user.
 */
async function pushToUser(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const db = getDb();
  const [subs] = await db.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );

  if (!subs.length) return;

  await Promise.allSettled(
    subs.map(sub => sendPush(sub, payload))
  );
}

/**
 * Get the public VAPID key (for client-side subscription).
 */
function getVapidPublicKey() {
  return VAPID_PUBLIC;
}

module.exports = { sendPush, pushToUser, getVapidPublicKey };
