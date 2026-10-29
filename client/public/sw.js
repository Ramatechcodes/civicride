self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : 'You have a CivicRide update.' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'CivicRide', {
    body: data.body || 'You have a new ride update.', icon: '/civicride-icon.svg', badge: '/civicride-icon.svg',
    tag: data.tag || 'civicride-update', renotify: Boolean(data.renotify), data: { url: data.url || '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
