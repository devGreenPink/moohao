import {joinRoom, selfId} from '../vendor/vendor.js'

export {selfId}

const APP_ID = 'nearby-p2p-share-v1-7f3c2a'

/** Upper bound on a single offered file; the receiver decides what it can actually store. */
export const MAX_OFFER_BYTES = 1024 ** 4

/** How long a receiver has to accept an offer before it counts as declined. */
const OFFER_TIMEOUT_MS = 5 * 60 * 1000

/** How long a pairing request waits for an answer. */
const PAIR_TIMEOUT_MS = 2 * 60 * 1000

/**
 * File bytes go over their own data channel ("raw" path), separate from Trystero's channel
 * that carries control messages, so Cancel / progress acks never queue behind megabytes of
 * file data. The channel is pre-negotiated with a fixed id on the existing connection, so
 * opening it needs no extra signalling. If it can't be opened, bytes fall back to Trystero
 * messages (WIRE_CHUNK each).
 */
const RAW_CHANNEL_ID = 1001
const RAW_CHUNK = 64 * 1024
const RAW_HEADER = 16 // u32 route key, u32 file index, f64 offset
const RAW_HIGH_WATER = 4 * 1024 ** 2
const WIRE_CHUNK = 15 * 1024

/** Trystero-path chunks queued at once on the sending side (~1 MB). */
const SEND_WINDOW = 64

/** Early chunks the receiver will hold while waiting for a gap to fill. */
const REORDER_LIMIT = SEND_WINDOW * 4

/** Bytes read from disk at a time on the sending side. */
const READ_BLOCK = 1024 * 1024

/**
 * Flow control: the receiver reports how much it has actually stored every ACK_EVERY bytes,
 * and the sender never runs more than FLOW_WINDOW ahead of that, so a slow disk can't make
 * the receiver buffer the whole file in memory.
 */
const FLOW_WINDOW = 8 * 1024 ** 2
const ACK_EVERY = 1024 ** 2

/** A transfer with no progress in either direction for this long is abandoned. */
const IDLE_TIMEOUT_MS = 60 * 1000

/** If the connection drops mid-transfer, both sides wait this long for it to come back. */
export const RESUME_WAIT_MS = 90 * 1000

/** After the last chunk is sent, how long to wait for the receiver's "all saved". */
const ACK_TIMEOUT_MS = 3 * 60 * 1000

// 64 distinct, easy-to-name emoji for the safety code (single code points only).
const EMOJI = Array.from('🐼🦊🐨🐯🦁🐸🐵🐧🐤🦉🐙🦋🐝🐞🐢🐳🐬🦄🐰🐱🐶🐹🦔🦕🌵🌻🌸🍀🍄🌙🌟🌞🌈🧊🔥💧🍎🍓🍒🍑🍍🥝🍉🍋🥑🌽🍩🍪🧁🍭🎈🎁🎀🎨🎸🚀🎯🔑💎🔔📚📌🧩🎲')

export function randomId(bytes = 16) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomU32 = () => crypto.getRandomValues(new Uint32Array(1))[0]

async function sha256Hex(text) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
  }
  // Non-secure contexts (plain http on a LAN IP) have no crypto.subtle; a weak hash is fine
  // for naming rooms. (The safety code is not shown without crypto.subtle.)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

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

/**
 * Devices behind the same router share one public IPv4 address, so a room named after
 * a hash of that address groups everyone on the same network (the same idea Snapdrop's
 * server uses). Returns null if the address can't be fetched.
 */
export async function detectNetworkRoom() {
  const ip = await fetchPublicIPv4()
  if (!ip) return null
  const hash = await sha256Hex(`${APP_ID}|${ip}`)
  return {roomId: `net-${hash.slice(0, 32)}`, password: hash.slice(32)}
}

export function codeRoom(code) {
  return {roomId: `code-${code}`, password: `${APP_ID}|${code}`}
}

/** A pairing's private room, derived from the secret both devices store. */
export async function pairRoom(secret) {
  const hash = await sha256Hex(`${APP_ID}|pair|${secret}`)
  return {roomId: `pair-${hash.slice(0, 32)}`, password: secret}
}

export async function pairIdOf(secret) {
  return (await sha256Hex(`${APP_ID}|pairid|${secret}`)).slice(0, 16)
}

// ---------- raw file-data channel (one per peer connection, shared by all rooms) ----------

const rawChannels = new WeakMap() // RTCPeerConnection -> {channel, routes: Map(key -> fn)}

function rawLink(pc) {
  if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') return null
  const known = rawChannels.get(pc)
  if (known && known.channel.readyState !== 'closing' && known.channel.readyState !== 'closed') return known
  let channel
  try {
    channel = pc.createDataChannel('nearby-files', {negotiated: true, id: RAW_CHANNEL_ID, ordered: true})
  } catch {
    return null
  }
  channel.binaryType = 'arraybuffer'
  channel.bufferedAmountLowThreshold = RAW_HIGH_WATER / 4
  // Routes are per channel, so only the peer on this connection can feed a transfer.
  const link = {channel, routes: new Map()}
  channel.onmessage = ({data}) => {
    if (!(data instanceof ArrayBuffer) || data.byteLength <= RAW_HEADER) return
    const view = new DataView(data)
    link.routes.get(view.getUint32(0))?.(view.getUint32(4), view.getFloat64(8), new Uint8Array(data, RAW_HEADER))
  }
  rawChannels.set(pc, link)
  return link
}

function channelOpen(channel, timeoutMs = 8000) {
  if (channel.readyState === 'open') return Promise.resolve(true)
  return new Promise(resolve => {
    const done = ok => {
      clearTimeout(timer)
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('close', onClose)
      resolve(ok)
    }
    const onOpen = () => done(true)
    const onClose = () => done(false)
    const timer = setTimeout(() => done(channel.readyState === 'open'), timeoutMs)
    channel.addEventListener('open', onOpen)
    channel.addEventListener('close', onClose)
  })
}

/** Wait until the channel's buffer drains below the low-water mark (false if it closed). */
function channelDrained(channel) {
  if (channel.readyState !== 'open') return Promise.resolve(false)
  if (channel.bufferedAmount <= RAW_HIGH_WATER) return Promise.resolve(true)
  return new Promise(resolve => {
    const done = ok => {
      channel.removeEventListener('bufferedamountlow', onLow)
      channel.removeEventListener('close', onClose)
      clearTimeout(timer)
      resolve(ok)
    }
    const onLow = () => done(true)
    const onClose = () => done(false)
    const timer = setTimeout(() => done(channel.readyState === 'open' && channel.bufferedAmount <= RAW_HIGH_WATER), IDLE_TIMEOUT_MS)
    channel.addEventListener('bufferedamountlow', onLow)
    channel.addEventListener('close', onClose)
  })
}

/**
 * Sink for an accepted incoming transfer (provided by the app):
 *   write(fileIndex, Uint8Array) -> Promise   (bytes arrive in order)
 *   closeFile(fileIndex)         -> Promise
 *   finish()                     -> Promise
 *   abort()                      -> void
 *
 * Handlers:
 *  onPeer(peerId, info|null)
 *  onOffer(peerId, offer, signal) => Promise<Sink|null>
 *  onOfferCancelled(peerId, tid)              sender withdrew an offer still being decided
 *  onIncomingProgress(peerId, tid, receivedBytes, totalBytes)
 *  onIncomingPaused(peerId, tid)              connection dropped; waiting for it to resume
 *  onIncomingDone(peerId, tid)
 *  onIncomingFailed(peerId, tid, reason)      reason: 'failed' | 'cancelled'
 *  onText(peerId, text)
 *  onPairRequest(peerId, {secret, name, deviceId}, signal) => Promise<boolean>
 *  onPairConfirmed(peerId, {secret, name, deviceId})   requester saved the pairing too
 *  onUnpair(peerId, pairId)
 *  onError(message)
 */
export function createSession({roomId, password}, me, handlers) {
  const room = joinRoom(
    {appId: APP_ID, password},
    roomId,
    {onJoinError: ({error}) => handlers.onError?.(error)},
  )

  const peers = new Map() // peerId -> info
  const incoming = new Map() // tid -> transfer state
  const outgoing = new Map() // tid -> sender state
  const completed = new Set() // tids we finished receiving (answers a late resume)
  const withdrawn = new Set() // offers the sender cancelled before we answered
  const pendingPairs = new Map() // secret -> {peerId, request, at}
  const rejoinWaiters = new Map() // peerId -> Set(resolve)

  const hello = room.makeAction('hello')
  const text = room.makeAction('text')
  const chunk = room.makeAction('chunk')
  const ctrl = room.makeAction('ctrl')

  const pcOf = peerId => room.getPeers()[peerId]

  /** Point a transfer's raw-channel route at the receive handler. */
  function routeRaw(peerId, tid, key) {
    if (!Number.isInteger(key)) return false
    const link = rawLink(pcOf(peerId))
    if (!link) return false
    link.routes.set(key, (i, o, bytes) => receiveChunk(peerId, tid, i, o, bytes))
    const t = incoming.get(tid)
    if (t) t.unroute = () => link.routes.delete(key)
    return true
  }

  const offer = room.makeAction('offer', {
    kind: 'request',
    onRequest: async (data, {peerId, signal}) => {
      if (!validOffer(data) || incoming.has(data.tid)) return {ok: false}
      const sink = await handlers.onOffer(peerId, data, signal).catch(() => null)
      // too many offers from this device at once: say so, so the sender can try again later
      if (sink === 'busy') return {ok: false, busy: true}
      if (!sink || signal?.aborted || withdrawn.has(data.tid) || !peers.has(peerId)) {
        sink?.abort()
        return {ok: false}
      }
      startIncoming(peerId, data, sink)
      const raw = routeRaw(peerId, data.tid, data.raw)
      return {ok: true, flow: true, raw}
    },
  })

  // The sender came back after a dropped connection: tell it where to continue.
  const resume = room.makeAction('resume', {
    kind: 'request',
    onRequest: (data, {peerId}) => {
      const tid = typeof data?.tid === 'string' ? data.tid : null
      if (tid && completed.has(tid)) return {ok: true, complete: true}
      const t = tid && incoming.get(tid)
      if (!t || t.peerId !== peerId) return {ok: false}
      t.suspended = false
      t.lastActivity = Date.now()
      t.pending.clear()
      t.unroute?.()
      const raw = routeRaw(peerId, tid, data.raw)
      handlers.onIncomingProgress?.(peerId, tid, t.received, t.total)
      return {ok: true, i: t.fileIndex, o: t.fileOffset, written: t.written, raw}
    },
  })

  const pair = room.makeAction('pair', {
    kind: 'request',
    onRequest: async (data, {peerId, signal}) => {
      if (!data || typeof data.secret !== 'string' || data.secret.length < 16) return {ok: false}
      const request = {
        secret: data.secret.slice(0, 64),
        name: String(data.name || '').slice(0, 40),
        deviceId: String(data.deviceId || '').slice(0, 64),
      }
      const ok = await handlers.onPairRequest(peerId, request, signal).catch(() => false)
      if (!ok || signal?.aborted) return {ok: false}
      // Saved only once the requester confirms it got this answer (see 'pair-ok'), so a
      // request that already timed out on their side can't leave a one-sided pairing.
      pendingPairs.set(request.secret, {peerId, request, at: Date.now()})
      return {ok: true, name: me.name, deviceId: me.deviceId}
    },
  })

  room.onPeerJoin = peerId => {
    hello.send(me, {target: peerId})
    const waiters = rejoinWaiters.get(peerId)
    if (waiters) {
      rejoinWaiters.delete(peerId)
      waiters.forEach(resolve => resolve(true))
    }
  }

  room.onPeerLeave = peerId => {
    peers.delete(peerId)
    for (const [tid, t] of incoming) {
      if (t.peerId !== peerId || t.done) continue
      // Keep what we have and wait for the sender to come back and resume.
      t.suspended = true
      t.suspendedAt = Date.now()
      t.pending.clear()
      handlers.onIncomingPaused?.(peerId, tid)
    }
    for (const o of outgoing.values()) {
      if (o.peerId === peerId) o.interrupt()
    }
    handlers.onPeer(peerId, null)
  }

  function waitForRejoin(peerId, isCancelled) {
    if (peers.has(peerId) && pcOf(peerId)) return Promise.resolve(true)
    return new Promise(resolve => {
      const set = rejoinWaiters.get(peerId) || new Set()
      rejoinWaiters.set(peerId, set)
      const finish = ok => {
        clearTimeout(timer)
        clearInterval(poll)
        set.delete(finish)
        resolve(ok)
      }
      set.add(finish)
      const timer = setTimeout(() => finish(false), RESUME_WAIT_MS)
      const poll = setInterval(() => { if (isCancelled()) finish(false) }, 500)
    })
  }

  hello.onMessage = (info, {peerId}) => {
    if (!info || typeof info !== 'object') return
    const clean = {
      name: String(info.name || 'Unknown').slice(0, 40),
      device: ['phone', 'tablet', 'desktop'].includes(info.device) ? info.device : 'desktop',
      os: String(info.os || '').slice(0, 20),
      browser: String(info.browser || '').slice(0, 20),
      deviceId: String(info.deviceId || '').slice(0, 64),
      // Checked against the allowed lists by the app (identity.js withLook).
      avatar: typeof info.avatar === 'string' ? info.avatar.slice(0, 8) : null,
      color: Number.isInteger(info.color) ? info.color : null,
    }
    peers.set(peerId, clean)
    handlers.onPeer(peerId, clean)
  }

  text.onMessage = (data, {peerId}) => {
    if (typeof data === 'string' && data.length) handlers.onText(peerId, data.slice(0, 100_000))
  }

  ctrl.onMessage = (msg, {peerId}) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'unpair' && typeof msg.pid === 'string') {
      handlers.onUnpair?.(peerId, msg.pid)
      return
    }
    if (msg.t === 'pair-ok' && typeof msg.secret === 'string') {
      const pending = pendingPairs.get(msg.secret)
      pendingPairs.delete(msg.secret)
      if (pending && pending.peerId === peerId && Date.now() - pending.at < PAIR_TIMEOUT_MS + 30_000) {
        handlers.onPairConfirmed?.(peerId, pending.request)
      }
      return
    }
    const tid = typeof msg.tid === 'string' ? msg.tid : null
    if (!tid) return
    const out = outgoing.get(tid)
    if (out && out.peerId === peerId) {
      if (msg.t === 'prog' && Number.isSafeInteger(msg.n)) {
        out.acked = Math.max(out.acked, msg.n)
        out.lastAck = Date.now()
        out.wake?.()
      } else if (msg.t === 'ack') out.settle('done')
      else if (msg.t === 'cancel') out.settle('cancelled')
      else if (msg.t === 'fail') out.settle('failed')
    }
    if (msg.t === 'cancel' || msg.t === 'fail') {
      const inc = incoming.get(tid)
      if (inc && inc.peerId === peerId) {
        failIncoming(tid, msg.t === 'cancel' ? 'cancelled' : 'failed', false)
      } else if (!inc && !out) {
        // The offer was withdrawn while we were still deciding.
        if (withdrawn.size > 200) withdrawn.clear()
        withdrawn.add(tid)
        handlers.onOfferCancelled?.(peerId, tid)
      }
    }
  }

  // ---------- receiving ----------

  function startIncoming(peerId, data, sink) {
    const files = data.files
    const t = {
      peerId,
      files,
      sink,
      fileIndex: 0,
      fileOffset: 0,
      received: 0,
      written: 0,
      reported: 0,
      total: files.reduce((s, f) => s + f.size, 0),
      chain: Promise.resolve(),
      lastProgress: 0,
      lastActivity: Date.now(),
      done: false,
      suspended: false,
      suspendedAt: 0,
      unroute: null,
      pending: new Map(), // "fileIndex:offset" -> bytes that arrived early
    }
    incoming.set(data.tid, t)
    // Zero-byte files get no chunks, so close them (and any run of them) right away.
    skipEmptyFiles(data.tid, t)
  }

  function afterWrite(tid, t, length) {
    t.written += length
    t.lastActivity = Date.now()
    if (t.written - t.reported >= ACK_EVERY && incoming.get(tid) === t) {
      t.reported = t.written
      ctrl.send({t: 'prog', tid, n: t.written}, {target: t.peerId}).catch(() => {})
    }
  }

  function skipEmptyFiles(tid, t) {
    while (t.fileIndex < t.files.length && t.files[t.fileIndex].size === t.fileOffset) {
      const i = t.fileIndex
      t.chain = t.chain.then(() => t.sink.closeFile(i))
      t.fileIndex++
      t.fileOffset = 0
    }
    if (t.fileIndex >= t.files.length && !t.done) {
      t.done = true
      t.chain
        .then(() => t.sink.finish())
        .then(() => {
          if (incoming.get(tid) !== t) return
          incoming.delete(tid)
          t.unroute?.()
          if (completed.size > 200) completed.clear()
          completed.add(tid)
          ctrl.send({t: 'ack', tid}, {target: t.peerId}).catch(() => {})
          handlers.onIncomingDone(t.peerId, tid)
        })
        .catch(err => failIncoming(tid, 'failed', true, err))
    }
  }

  function failIncoming(tid, reason, tellSender, err) {
    const t = incoming.get(tid)
    if (!t) return
    if (err) console.warn('nearby: receive failed', err)
    incoming.delete(tid)
    t.unroute?.()
    try { t.sink.abort() } catch {}
    if (tellSender) ctrl.send({t: reason === 'cancelled' ? 'cancel' : 'fail', tid}, {target: t.peerId}).catch(() => {})
    handlers.onIncomingFailed(t.peerId, tid, reason)
  }

  /** Bytes for (file i, offset o) from either path. Put back in order, then into the sink. */
  function receiveChunk(peerId, tid, i, o, bytes) {
    const t = incoming.get(tid)
    if (!t || t.peerId !== peerId || t.done) return
    const file = t.files[i]
    if (!Number.isInteger(i) || !Number.isSafeInteger(o) || !file || o < 0 || o + bytes.length > file.size || !bytes.length) {
      console.warn('nearby: bad chunk', i, o, bytes.length)
      failIncoming(tid, 'failed', true)
      return
    }
    t.suspended = false
    t.lastActivity = Date.now()
    // Already have it (a resend after a reconnect overlapped what had arrived)?
    if (i < t.fileIndex || (i === t.fileIndex && o < t.fileOffset)) return
    t.pending.set(`${i}:${o}`, bytes)
    if (t.pending.size > REORDER_LIMIT) {
      console.warn('nearby: too many out-of-order chunks; expected', t.fileIndex, t.fileOffset)
      failIncoming(tid, 'failed', true)
      return
    }
    while (!t.done) {
      const key = `${t.fileIndex}:${t.fileOffset}`
      const piece = t.pending.get(key)
      if (!piece) break
      t.pending.delete(key)
      const fi = t.fileIndex
      t.fileOffset += piece.length
      t.received += piece.length
      t.chain = t.chain.then(() => t.sink.write(fi, piece)).then(() => afterWrite(tid, t, piece.length))
      t.chain.catch(err => failIncoming(tid, 'failed', true, err))
      skipEmptyFiles(tid, t)
    }

    const now = performance.now()
    if (now - t.lastProgress > 120 || t.received === t.total) {
      t.lastProgress = now
      handlers.onIncomingProgress?.(peerId, tid, t.received, t.total)
    }
  }

  chunk.onMessage = (data, {peerId, metadata}) => {
    if (typeof metadata?.t !== 'string') return
    receiveChunk(peerId, metadata.t, metadata.i, metadata.o, data instanceof Uint8Array ? data : new Uint8Array(data))
  }

  // Abandon receives that have stopped moving, or whose sender never came back.
  const watchdog = setInterval(() => {
    const now = Date.now()
    for (const [tid, t] of incoming) {
      if (t.done) continue
      if (t.suspended ? now - t.suspendedAt > RESUME_WAIT_MS : now - t.lastActivity > IDLE_TIMEOUT_MS) {
        failIncoming(tid, 'failed', !t.suspended)
      }
    }
    for (const [secret, p] of pendingPairs) {
      if (now - p.at > PAIR_TIMEOUT_MS + 30_000) pendingPairs.delete(secret)
    }
  }, 5000)

  // ---------- sending ----------

  /**
   * Send bytes from position (i, o) to the end, or until interrupted / settled.
   * Returns 'done' or 'broken' (connection dropped or a send failed).
   */
  async function pump(out, files, from, useRaw, key, report) {
    const {peerId, tid} = out
    let channel = null
    if (useRaw) {
      channel = rawLink(pcOf(peerId))?.channel
      if (!channel || !(await channelOpen(channel))) return 'broken'
    }
    const inflight = []
    let sendError = null
    const chunkSize = useRaw ? RAW_CHUNK : WIRE_CHUNK

    for (let i = from.i; i < files.length; i++) {
      const file = files[i]
      for (let pos = i === from.i ? from.o : 0; pos < file.size; pos += READ_BLOCK) {
        // Don't run too far ahead of what the receiver has actually stored.
        while (out.flow && !out.result && !out.broken && out.sent - out.acked > FLOW_WINDOW) {
          if (Date.now() - out.lastAck > IDLE_TIMEOUT_MS) {
            out.broken = true
            break
          }
          await out.waitForAck()
          report()
        }
        if (out.result || out.broken || sendError) break
        const block = new Uint8Array(await file.slice(pos, pos + READ_BLOCK).arrayBuffer())
        for (let off = 0; off < block.length; off += chunkSize) {
          if (out.result || out.broken || sendError) break
          const piece = block.subarray(off, off + chunkSize)
          if (useRaw) {
            if (channel.bufferedAmount > RAW_HIGH_WATER && !(await channelDrained(channel))) {
              out.broken = true
              break
            }
            const msg = new Uint8Array(RAW_HEADER + piece.length)
            const view = new DataView(msg.buffer)
            view.setUint32(0, key)
            view.setUint32(4, i)
            view.setFloat64(8, pos + off)
            msg.set(piece, RAW_HEADER)
            try {
              channel.send(msg)
            } catch {
              out.broken = true
              break
            }
          } else {
            // slice (copy), not subarray: the payload must not drag the whole block along
            const p = chunk.send(piece.slice(), {target: peerId, metadata: {t: tid, i, o: pos + off}})
            p.catch(err => { sendError ??= err })
            inflight.push(p)
            if (inflight.length >= SEND_WINDOW) await inflight.shift().catch(() => {})
          }
          out.sent += piece.length
          report()
        }
        if (out.result || out.broken || sendError) break
      }
      if (out.result || out.broken || sendError) break
    }
    await Promise.all(inflight.map(p => p.catch(() => {})))
    if (sendError) console.warn('nearby: chunk send failed', sendError)
    return out.broken || sendError ? 'broken' : 'done'
  }

  // ---------- public API ----------

  return {
    peers,

    announce(info) {
      Object.assign(me, info)
      hello.send(me)
    },

    sendText(peerId, value) {
      return text.send(value, {target: peerId})
    },

    /** Cancel a transfer in either direction (including an offer still awaiting an answer). */
    cancel(tid) {
      const out = outgoing.get(tid)
      if (out) {
        ctrl.send({t: 'cancel', tid}, {target: out.peerId}).catch(() => {})
        out.settle('cancelled')
      }
      if (incoming.has(tid)) failIncoming(tid, 'cancelled', true)
    },

    /**
     * Offer files to a peer, then stream them if accepted, resuming after short drops.
     * onStatus(state, doneBytes, totalBytes):
     *   'waiting' | 'sending' | 'reconnecting' | 'done' | 'declined' | 'failed' | 'cancelled'
     * onTid(tid) is called first so the caller can cancel.
     */
    async sendFiles(peerId, files, thumbs, onStatus, onTid) {
      const tid = randomId(9)
      const key = randomU32()
      const list = files.map((f, i) => ({
        name: f.name || 'file',
        type: f.type || '',
        size: f.size,
        thumb: thumbs[i] || null,
      }))
      const total = list.reduce((s, f) => s + f.size, 0)
      const offsets = [] // bytes before file i
      list.reduce((s, f, i) => (offsets[i] = s) + f.size, 0)

      let settleWait
      const settled = new Promise(r => { settleWait = r })
      const abortOffer = new AbortController()
      const out = {
        tid,
        peerId,
        result: null,
        flow: false,
        sent: 0,
        acked: 0,
        lastAck: Date.now(),
        broken: false,
        wake: null,
        streaming: false,
        settle: state => {
          if (out.result) return
          out.result = state
          abortOffer.abort()
          out.wake?.()
          settleWait(state)
        },
        // Connection to the receiver dropped.
        interrupt: () => {
          if (out.streaming) {
            out.broken = true
            out.wake?.()
          } else {
            out.settle('failed')
          }
        },
        waitForAck: () => new Promise(r => {
          out.wake = r
          setTimeout(r, 1000)
        }),
      }
      outgoing.set(tid, out)
      onTid?.(tid)
      onStatus('waiting', 0, total)

      let lastReport = 0
      const report = force => {
        const now = performance.now()
        if (force || now - lastReport > 120) {
          lastReport = now
          onStatus('sending', Math.min(total, out.flow ? out.acked : out.sent), total)
        }
      }

      try {
        // Open the file channel now so it's ready by the time the receiver accepts.
        const canRaw = !!rawLink(pcOf(peerId))
        let answer
        try {
          answer = await offer.request(
            {tid, files: list, raw: canRaw ? key : undefined},
            {target: peerId, timeoutMs: OFFER_TIMEOUT_MS, signal: abortOffer.signal},
          )
        } catch (err) {
          if (!out.result) {
            console.warn('nearby: offer failed', err)
            out.settle('failed')
          }
        }
        if (!out.result && !answer?.ok) out.settle(answer?.busy ? 'busy' : 'declined')
        if (out.result) return onStatus(out.result, 0, total)

        out.flow = !!answer.flow
        out.streaming = true
        let useRaw = canRaw && !!answer.raw
        let from = {i: 0, o: 0}

        while (!out.result) {
          const outcome = await pump(out, files, from, useRaw, key, report)
          if (out.result || outcome === 'done') break

          // The connection dropped: wait for the receiver to come back, then continue from
          // what it has. (Its sink keeps everything received so far.)
          onStatus('reconnecting', Math.min(total, out.acked), total)
          const back = await waitForRejoin(peerId, () => !!out.result)
          if (out.result) break
          if (!back) {
            out.settle('failed')
            break
          }
          let res = null
          try {
            res = await resume.request({tid, raw: rawLink(pcOf(peerId)) ? key : undefined}, {target: peerId, timeoutMs: 15_000})
          } catch {}
          if (out.result) break
          if (res?.complete) {
            out.settle('done')
            break
          }
          if (!res?.ok || !Number.isInteger(res.i) || !Number.isSafeInteger(res.o) || res.i > files.length) {
            out.settle('failed')
            break
          }
          from = {i: res.i, o: res.o}
          out.sent = res.i < files.length ? offsets[res.i] + res.o : total
          out.acked = Number.isSafeInteger(res.written) ? res.written : 0
          out.lastAck = Date.now()
          out.broken = false
          useRaw = !!res.raw && !!rawLink(pcOf(peerId))
        }

        if (!out.result) {
          report(true)
          const timer = setTimeout(() => out.settle('failed'), ACK_TIMEOUT_MS)
          settled.then(() => clearTimeout(timer))
          // Keep the progress bar moving while the receiver finishes writing.
          while (!out.result && out.flow) {
            await out.waitForAck()
            if (out.broken) {
              // Dropped while it was finishing: ask whether it got everything.
              const back = await waitForRejoin(peerId, () => !!out.result)
              if (out.result) break
              const res = back ? await resume.request({tid}, {target: peerId, timeoutMs: 15_000}).catch(() => null) : null
              if (res?.complete) out.settle('done')
              else out.settle('failed')
              break
            }
            report()
          }
        }
        onStatus(await settled, Math.min(total, out.flow ? out.acked : out.sent), total)
      } catch (err) {
        console.warn('nearby: transfer failed', err)
        out.settle('failed')
        onStatus(out.result, 0, total)
      } finally {
        outgoing.delete(tid)
      }
    },

    /** Safety code: 4 emoji derived from both ends' DTLS certificate fingerprints. */
    async verificationCode(peerId) {
      if (!crypto.subtle) return null
      const pc = pcOf(peerId)
      const fp = sdp => (/a=fingerprint:\S+ ([0-9A-Fa-f:]+)/.exec(sdp || '') || [])[1]?.toUpperCase()
      const a = fp(pc?.localDescription?.sdp)
      const b = fp(pc?.remoteDescription?.sdp)
      if (!a || !b) return null
      const hex = await sha256Hex(`nearby-sas|${[a, b].sort().join('|')}`)
      return [0, 1, 2, 3].map(k => EMOJI[parseInt(hex.slice(k * 2, k * 2 + 2), 16) % EMOJI.length]).join('')
    },

    /** Ask a connected peer to pair permanently. Resolves to {ok, name, deviceId}. */
    async requestPair(peerId, secret) {
      try {
        const res = await pair.request({secret, name: me.name, deviceId: me.deviceId}, {target: peerId, timeoutMs: PAIR_TIMEOUT_MS})
        return res && res.ok ? {ok: true, name: String(res.name || '').slice(0, 40), deviceId: String(res.deviceId || '').slice(0, 64)} : {ok: false}
      } catch {
        return {ok: false}
      }
    },

    /** Second step of pairing: tell the other device we received its "yes". */
    confirmPair(peerId, secret) {
      return ctrl.send({t: 'pair-ok', secret}, {target: peerId}).catch(() => {})
    },

    tellUnpair(peerId, pairId) {
      return ctrl.send({t: 'unpair', pid: pairId}, {target: peerId}).catch(() => {})
    },

    leave() {
      clearInterval(watchdog)
      room.onPeerJoin = room.onPeerLeave = null
      for (const tid of [...incoming.keys()]) failIncoming(tid, 'failed', false)
      for (const o of outgoing.values()) o.settle('failed')
      for (const set of rejoinWaiters.values()) set.forEach(resolve => resolve(false))
      rejoinWaiters.clear()
      return room.leave()
    },
  }
}

function validOffer(data) {
  return data && typeof data.tid === 'string' && data.tid.length <= 32 &&
    (data.raw === undefined || Number.isInteger(data.raw)) &&
    Array.isArray(data.files) && data.files.length > 0 && data.files.length <= 1000 &&
    data.files.every(f => f && typeof f.name === 'string' && Number.isSafeInteger(f.size) && f.size >= 0 && f.size <= MAX_OFFER_BYTES)
}
