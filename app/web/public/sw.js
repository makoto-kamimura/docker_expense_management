// Web Push を受け取って通知を出す Service Worker (components/PushToggle.tsx が登録する)。
// API (app/backend/src/push.rs) は { title, body, url, tag } の JSON を送る。

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'RingiWoMerge', {
      body: data.body || '',
      icon: '/icon.png',
      // 同じ稟議の通知は 1 件にまとめ、新しい通知が来たらもう一度知らせる
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = windows.find((w) => w.url === url) ?? windows.find((w) => new URL(w.url).origin === self.location.origin);
      // 開いているタブがあれば、そのタブで稟議を開く
      if (same) {
        if (same.url !== url && 'navigate' in same) await same.navigate(url);
        return same.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
