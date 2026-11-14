// Nearby service worker:
//  1. keeps a copy of the app so it opens instantly / offline (network first, cache fallback)
//  2. receives files shared from other apps (Web Share Target, Android)
//  3. turns streamed incoming files into normal downloads (/__dl/<id>/<name>)

const VERSION = 'nearby-v2.7.1'
const SHELL_CACHE = `${VERSION}-shell`
const SHARE_CACHE = 'nearby-share'

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/net.js',
  './js/i18n.js',
  './js/sinks.js',
  './js/pairing.js',
  './js/notify.js',
  './js/words.js',
  './js/identity.js',
  './js/known.js',
  './js/ui/transfers.js',
  './js/ui/avatars.js',
  './js/ui/effects.js',
  './js/ui/scanner.js',
  './vendor/jsqr.js',
  './js/ui/mascot.js',
  './js/ui/radar.js',
  './js/ui/panel.js',
  './js/ui/status.js',
  './js/ui/sky.js',
  './vendor/vendor.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

const scopeUrl = path => new URL(path, self.registration.scope).href

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL.map(scopeUrl)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.endsWith('-shell') && key !== SHELL_CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

// ---------- streamed downloads ----------

const downloads = new Map() // id -> {port, name, size, mime}

self.addEventListener('message', event => {
  const data = event.data
  if (data?.type === 'nearby-keepalive') {
    // Pinged every 10 s while a streamed download runs; holding the event open until the
    // next ping stops the browser from shutting this worker down mid-download.
    event.waitUntil(new Promise(resolve => setTimeout(resolve, 15_000)))
    return
  }
  if (data?.type !== 'nearby-dl' || !event.ports[0]) return
  const port = event.ports[0]
  if (typeof data.id !== 'string' || downloads.size > 50) {
    port.postMessage('refused')
    return
  }
  downloads.set(data.id, {port, name: String(data.name || 'file'), size: Number(data.size) || 0, mime: String(data.mime || 'application/octet-stream')})
  // Forget registrations that are never fetched.
  setTimeout(() => downloads.delete(data.id), 60_000)
  port.postMessage('ready')
})

function streamDownload(id) {
  const dl = downloads.get(id)
  if (!dl) return new Response('Not found', {status: 404})
  downloads.delete(id)
  const body = new ReadableStream({
    start(controller) {
      dl.port.onmessage = ({data}) => {
        if (data === 'end') controller.close()
        else if (data === 'abort') controller.error(new Error('aborted'))
        else controller.enqueue(new Uint8Array(data))
      }
    },
    cancel() {
      dl.port.postMessage('cancelled')
    },
  })
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(dl.name)}`,
    'X-Content-Type-Options': 'nosniff',
  }
  if (dl.size > 0) headers['Content-Length'] = String(dl.size)
  return new Response(body, {headers})
}

// ---------- share target ----------

async function receiveShare(request) {
  const form = await request.formData()
  const files = form.getAll('files').filter(f => f && typeof f === 'object' && 'size' in f)
  const text = ['title', 'text', 'url'].map(k => form.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n')
  await caches.delete(SHARE_CACHE)
  const cache = await caches.open(SHARE_CACHE)
  const meta = {at: Date.now(), text, files: []}
  for (let i = 0; i < files.length && i < 200; i++) {
    const f = files[i]
    const key = scopeUrl(`__share/${i}`)
    await cache.put(key, new Response(f, {headers: {'Content-Type': f.type || 'application/octet-stream'}}))
    meta.files.push({key, name: f.name || `file-${i}`, type: f.type || '', size: f.size})
  }
  await cache.put(scopeUrl('__share/meta'), new Response(JSON.stringify(meta), {headers: {'Content-Type': 'application/json'}}))
  return Response.redirect(scopeUrl('./?shared=1'), 303)
}

// ---------- notification clicks ----------

self.addEventListener('notificationclick', event => {
  const {notification, action} = event
  notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true})
    const client = windows.find(c => c.url.startsWith(self.registration.scope))
    if (client) {
      client.postMessage({type: 'nearby-notification', action: action || 'open', tag: notification.tag, data: notification.data})
      // "Decline" can be handled without pulling the user back to the app.
      if (action !== 'decline') await client.focus().catch(() => {})
    } else if (!action) {
      await self.clients.openWindow(self.registration.scope)
    }
  })())
})

// ---------- fetch ----------

const FONT_CACHE = 'nearby-fonts'
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

/** Fonts: serve the saved copy immediately (works offline), refresh it in the background. */
async function fontResponse(event) {
  const cache = await caches.open(FONT_CACHE)
  const cached = await cache.match(event.request)
  const update = fetch(event.request)
    .then(res => {
      if (res.ok || res.type === 'opaque') cache.put(event.request, res.clone()).catch(() => {})
      return res
    })
  if (cached) {
    event.waitUntil(update.catch(() => {}))
    return cached
  }
  return update
}

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method === 'GET' && FONT_HOSTS.has(url.hostname)) {
    event.respondWith(fontResponse(event))
    return
  }
  if (url.origin !== self.location.origin || !req.url.startsWith(self.registration.scope)) return

  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length)

  if (req.method === 'POST' && path === 'share-target') {
    event.respondWith(receiveShare(req).catch(() => Response.redirect(scopeUrl('./'), 303)))
    return
  }
  if (req.method !== 'GET') return

  const dl = /^__dl\/([^/]+)\//.exec(path)
  if (dl) {
    event.respondWith(streamDownload(dl[1]))
    return
  }
  if (path.startsWith('__share/')) return

  // Network first so updates show up right away; cached copy when offline.
  event.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res.ok && res.type === 'basic') {
        const copy = res.clone()
        caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {})
      }
      return res
    } catch {
      const cached = await caches.match(req, {ignoreSearch: true})
      if (cached) return cached
      if (req.mode === 'navigate') return (await caches.match(scopeUrl('./'))) || Response.error()
      return Response.error()
    }
  })())
})
