/**
 * Push Notification Manager — PaperPhone
 *
 * Handles Web Push subscription lifecycle:
 * - Feature detection (Android Chrome, iOS Safari 16.4+ PWA)
 * - Permission request
 * - Push subscription via VAPID
 * - Server-side subscription sync
 */
import { api } from '../api.js';

// ── Feature Detection ────────────────────────────────────────────────────

/**
 * Check if the browser supports Web Push notifications.
 * Returns true for: Chrome/Edge/Firefox on Android/desktop,
 *                    Safari 16.4+ on iOS (when installed as PWA).
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Check if we are running as a standalone PWA (added to home screen).
 * Required for iOS push support.
 */
export function isStandalonePWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true
  );
}

// ── Permission ───────────────────────────────────────────────────────────

/**
 * Get current notification permission state.
 * @returns {'granted'|'denied'|'default'}
 */
export function getPermissionState() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ── Subscription Management ──────────────────────────────────────────────

/**
 * Convert a base64url VAPID key string to a Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Subscribe to push notifications.
 * 1. Fetch VAPID public key from server.
 * 2. Request notification permission.
 * 3. Create PushSubscription via Service Worker.
 * 4. POST subscription to server.
 *
 * @returns {boolean} true if successfully subscribed
 */
export async function subscribePush() {
  if (!isPushSupported()) return false;

  // 1. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  // 2. Get VAPID public key
  let vapidKey;
  try {
    const res = await api.vapidKey();
    vapidKey = res.publicKey;
    if (!vapidKey) return false;
  } catch {
    console.error('Failed to fetch VAPID key');
    return false;
  }

  // 3. Get SW registration & subscribe
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // 4. Send subscription to server
    const subJSON = subscription.toJSON();
    await api.pushSubscribe({
      endpoint: subJSON.endpoint,
      keys: subJSON.keys,
    });

    localStorage.setItem('pp_push_enabled', '1');
    return true;
  } catch (err) {
    console.error('Push subscribe error:', err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api.pushUnsubscribe(endpoint);
    }
    localStorage.removeItem('pp_push_enabled');
    return true;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return false;
  }
}

/**
 * Check if the user has an active push subscription.
 */
export async function isPushSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/**
 * Try to silently subscribe on login (if permission already granted).
 * Won't prompt the user — only activates if they previously allowed.
 */
export async function tryAutoSubscribe() {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  const isSubscribed = await isPushSubscribed();
  if (!isSubscribed) {
    await subscribePush();
  }
}
