const CACHE_NAME = "garage-shell-v2";

// public/ 파일은 빌드 시 basePath가 붙지 않는다. 대신 서비스워커는 자기 스코프를 알고 있으므로
// 거기서 배포 프리픽스를 그대로 얻는다 — 루트 배포면 "", /garage 아래면 "/garage".
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/+$/, "");
const url = (path) => `${BASE_PATH}${path}`;

// 화면 경로에는 뒤 슬래시가 있어야 한다. trailingSlash 설정 때문에 슬래시 없는 주소는 308이
// 되는데, cache.addAll은 리다이렉트된 응답을 저장하지 못해 목록 전체가 통째로 실패한다.
const SHELL_ASSETS = [
  url("/"),
  url("/login/"),
  url("/manifest.webmanifest"),
  url("/icons/icon-192.png"),
  url("/icons/icon-512.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // API 요청은 항상 최신 데이터가 필요하므로 캐시하지 않고 네트워크로만 보낸다.
  if (request.url.includes("/api/")) return;

  // 나머지(앱 셸)는 네트워크 우선, 실패하면 캐시로 폴백 — 오프라인에서도 마지막 화면은 뜨게 한다.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match(url("/")))),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Garage", body: "", url: url("/") };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore malformed payload */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: url("/icons/icon-192.png"),
      badge: url("/icons/icon-192.png"),
      data: { url: data.url || url("/") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 서버가 보낸 url은 앱 기준 경로(/vehicles/1)이므로 프리픽스를 붙여 연다.
  const raw = event.notification.data?.url || "/";
  const target = raw.startsWith(BASE_PATH) ? raw : url(raw);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    }),
  );
});
