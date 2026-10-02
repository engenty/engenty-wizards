// Shows "your wizard is done" on phones, where a page may only notify through a service worker.
// No fetch handler: nothing is cached, every request goes to the network as before.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => url && w.url.startsWith(url)) ?? windows[0];
      return open ? open.focus() : url ? self.clients.openWindow(url) : undefined;
    }),
  );
});
