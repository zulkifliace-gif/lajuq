/**
 * Web Notification API & Device Vibration Helper for System Alerts
 * Handles OS System Notifications on Chrome, Edge, and iOS 16.4+ Safari.
 */

/**
 * Check if Web Notifications are supported by current browser
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  
  try {
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission;
    }
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
  }
  return Notification.permission || 'default';
}

/**
 * Send OS System Notification for Cancelled Order
 */
export function sendCancellationNotification(tableNumber, orderId, cancelReason) {
  // Trigger device hardware vibration if supported (Android/Chrome/Edge)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 150, 300, 150, 500]);
    } catch (e) {}
  }

  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const title = `❌ Pesanan Meja ${tableNumber} Dibatalkan!`;
    const reasonText = cancelReason ? `Sebab: ${cancelReason}` : 'Stok hidangan telah habis.';
    const options = {
      body: `Pesanan (${orderId}) telah dibatalkan oleh dapur. ${reasonText}`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `cancel-${orderId}`,
      requireInteraction: true,
      renotify: true
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
    return true;
  } catch (err) {
    console.error('Error sending OS notification:', err);
    return false;
  }
}
