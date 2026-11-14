import {joinRoom, selfId} from '../vendor/vendor.js'

export {selfId}

const APP_ID = 'nearby-p2p-share-v1-7f3c2a'

/** Largest single file we accept for now (whole file is held in memory). */
export const MAX_FILE_BYTES = 2 * 1024 ** 3

/** How long a receiver has to accept an offer before it counts as declined. */
const OFFER_TIMEOUT_MS = 5 * 60 * 1000

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newRoomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

async function sha256Hex(text) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
  }
  // Non-secure contexts (plain http on a LAN IP) have no crypto.subtle; a weak hash is fine
  // here because it only names the room.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Devices behind the same router share one public IPv4 address, so a room named after
 * a hash of that address groups everyone on the same network (the same idea Snapdrop's
 * server uses). Returns null if the address can't be fetched.
 */
const IP_SERVICES = [
  'https://api.ipify.org',
  'https://ipv4.icanhazip.com',
  'https://v4.ident.me',
]

async function fetchPublicIPv4() {
  for (const url of IP_SERVICES) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const res = await fetch(url, {signal: ctrl.signal, cache: 'no-store'})
      const ip = (await res.text()).trim()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
    } catch {
      // try the next service
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

export async function detectNetworkRoom() {
  const ip = await fetchPublicIPv4()
  if (!ip) return null
  const hash = await sha256Hex(`${APP_ID}|${ip}`)
  return {roomId: `net-${hash.slice(0, 32)}`, password: hash.slice(32)}
}

export function codeRoom(code) {
  return {roomId: `code-${code}`, password: `${APP_ID}|${code}`}
}

/**
 * One joined room. Handlers:
 *  onPeer(peerId, info|null)                       – peer appeared/updated, or left (null)
 *  onOffer(peerId, offer, signal) => Promise<bool> – ask the user to accept incoming files
 *  onIncomingProgress(peerId, tid, fraction)
 *  onFilesReceived(peerId, tid, files)             – files: [{name, type, size, blob}]
 *  onIncomingFailed(peerId, tid)
 *  onText(peerId, text)
 *  onError(message)
 */
export function createSession({roomId, password}, me, handlers) {
  const room = joinRoom(
    {appId: APP_ID, password, maxReceiveBytes: MAX_FILE_BYTES},
    roomId,
    {onJoinError: ({error}) => handlers.onError?.(error)},
  )

  const peers = new Map() // peerId -> {name, device, os, browser}
  const incoming = new Map() // tid -> {peerId, files, received, doneBytes, total}

  const hello = room.makeAction('hello')
  const text = room.makeAction('text')
  const file = room.makeAction('file')
  const offer = room.makeAction('offer', {
    kind: 'request',
    onRequest: async (data, {peerId, signal}) => {
      const ok = await handlers.onOffer(peerId, data, signal).catch(() => false)
      if (ok) {
        const total = data.files.reduce((s, f) => s + f.size, 0)
        incoming.set(data.tid, {peerId, files: data.files, received: [], doneBytes: 0, total})
      }
      return {ok: !!ok}
    },
  })

  room.onPeerJoin = peerId => {
    hello.send(me, {target: peerId})
  }

  room.onPeerLeave = peerId => {
    peers.delete(peerId)
    for (const [tid, t] of incoming) {
      if (t.peerId === peerId) {
        incoming.delete(tid)
        handlers.onIncomingFailed?.(peerId, tid)
      }
    }
    handlers.onPeer(peerId, null)
  }

  hello.onMessage = (info, {peerId}) => {
    if (!info || typeof info !== 'object') return
    const clean = {
      name: String(info.name || 'Unknown').slice(0, 40),
      device: ['phone', 'tablet', 'desktop'].includes(info.device) ? info.device : 'desktop',
      os: String(info.os || '').slice(0, 20),
      browser: String(info.browser || '').slice(0, 20),
    }
    peers.set(peerId, clean)
    handlers.onPeer(peerId, clean)
  }

  text.onMessage = (data, {peerId}) => {
    if (typeof data === 'string' && data.length) handlers.onText(peerId, data.slice(0, 100_000))
  }

  // Only accept file payloads that belong to an offer the user accepted.
  file.onReceive = ({peerId, metadata}) => {
    const t = metadata && incoming.get(metadata.tid)
    return !!t && t.peerId === peerId && Number.isInteger(metadata.i) && !!t.files[metadata.i]
  }

  file.onReceiveProgress = (fraction, {peerId, metadata}) => {
    const t = metadata && incoming.get(metadata.tid)
    if (!t || t.peerId !== peerId) return
    const size = t.files[metadata.i]?.size || 0
    handlers.onIncomingProgress?.(peerId, metadata.tid, t.total ? (t.doneBytes + fraction * size) / t.total : fraction)
  }

  file.onMessage = (data, {peerId, metadata}) => {
    const t = metadata && incoming.get(metadata.tid)
    if (!t || t.peerId !== peerId) return
    const meta = t.files[metadata.i]
    const blob = data instanceof Blob ? data : new Blob([data], {type: meta.type || 'application/octet-stream'})
    t.received[metadata.i] = {name: meta.name, type: meta.type, size: blob.size, blob}
    t.doneBytes += meta.size
    if (t.received.filter(Boolean).length === t.files.length) {
      incoming.delete(metadata.tid)
      handlers.onFilesReceived(peerId, metadata.tid, t.received)
    }
  }

  return {
    peers,

    announce(info) {
      Object.assign(me, info)
      hello.send(me)
    },

    sendText(peerId, value) {
      return text.send(value, {target: peerId})
    },

    /**
     * Offer files to a peer, then stream them one by one if accepted.
     * onStatus(state, fraction): 'waiting' | 'sending' | 'done' | 'declined' | 'failed'
     */
    async sendFiles(peerId, files, thumbs, onStatus) {
      const tid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      const list = files.map((f, i) => ({
        name: f.name || 'file',
        type: f.type || '',
        size: f.size,
        thumb: thumbs[i] || null,
      }))
      const total = list.reduce((s, f) => s + f.size, 0)
      onStatus('waiting', 0)
      let answer
      try {
        answer = await offer.request({tid, files: list}, {target: peerId, timeoutMs: OFFER_TIMEOUT_MS})
      } catch {
        onStatus('failed', 0)
        return
      }
      if (!answer?.ok) {
        onStatus('declined', 0)
        return
      }
      let doneBytes = 0
      const started = performance.now()
      try {
        for (let i = 0; i < files.length; i++) {
          const size = files[i].size
          await file.send(files[i], {
            target: peerId,
            metadata: {tid, i},
            onProgress: fraction => {
              const sent = doneBytes + fraction * size
              const secs = (performance.now() - started) / 1000
              onStatus('sending', total ? sent / total : 1, secs > 0.3 ? sent / secs : 0)
            },
          })
          doneBytes += size
        }
        onStatus('done', 1)
      } catch {
        onStatus('failed', total ? doneBytes / total : 0)
      }
    },

    leave() {
      room.onPeerJoin = room.onPeerLeave = null
      return room.leave()
    },
  }
}
