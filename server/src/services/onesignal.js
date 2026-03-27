/**
 * OneSignal Push Service — PaperPhone
 *
 * Sends native Android/iOS push notifications via OneSignal REST API.
 * Used for devices running the Median.co native wrapper APK.
 */
const { getDb } = require('../db/mysql');

const ONESIGNAL_APP_ID   = process.env.ONESIGNAL_APP_ID   || '';
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY  || '';

if (ONESIGNAL_APP_ID && ONESIGNAL_REST_KEY) {
  console.log('✅ OneSignal push configured');
} else {
  console.warn('⚠️  OneSignal keys not set — native push disabled');
}

/**
 * Send a push notification to a user via OneSignal.
 * Queries all registered OneSignal player IDs for the user.
 */
async function pushToUserOneSignal(userId, { title, body, data }) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_KEY) return;

  const db = getDb();
  const [rows] = await db.query(
    'SELECT player_id FROM onesignal_players WHERE user_id = ?',
    [userId]
  );

  if (!rows.length) return;

  const playerIds = rows.map(r => r.player_id);

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        headings: { en: title || 'PaperPhone' },
        contents: { en: body || 'You have a new message' },
        data: data || {},
        android_channel_id: undefined,   // uses default channel
        ios_sound: 'default',
        android_sound: 'default',
        priority: 10,
        ttl: 3600,
      }),
    });

    const result = await res.json();

    // Clean up invalid player IDs
    if (result.errors?.invalid_player_ids?.length) {
      const invalid = result.errors.invalid_player_ids;
      const placeholders = invalid.map(() => '?').join(',');
      await db.query(
        `DELETE FROM onesignal_players WHERE player_id IN (${placeholders})`,
        invalid
      );
      console.log(`🗑️  Removed ${invalid.length} invalid OneSignal player(s)`);
    }
  } catch (err) {
    console.error('OneSignal push error:', err.message);
  }
}

module.exports = { pushToUserOneSignal };
