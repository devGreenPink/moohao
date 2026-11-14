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
 * File bytes travel as many small ordered messages. Trystero sends payloads under its
 * 16 KiB frame size immediately (bigger ones need an offer/accept round trip each), and it
 * waits on the data channel's buffer between frames, so this streams with backpressure.
 */
const WIRE_CHUNK = 15 * 1024

/** Chunks queued at once on the sending side (~1 MB). */
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

/** After the last chunk is sent, how long to wait for the receiver's "all saved". */
const ACK_TIMEOUT_MS = 3 * 60 * 1000

// 64 distinct, easy-to-name emoji for the safety code (single code points only).
const EMOJI = Array.from('🐼🦊🐨🐯🦁🐸🐵🐧🐤🦉🐙🦋🐝🐞🐢🐳🐬🦄🐰🐱🐶🐹🦔🦕🌵🌻🌸🍀🍄🌙🌟🌞🌈🧊🔥💧🍎🍓🍒🍑🍍🥝🍉🍋🥑🌽🍩🍪🧁🍭🎈🎁🎀🎨🎸🚀🎯🔑💎🔔📚📌🧩🎲')

export function randomId(bytes = 16) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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
  const outgoing = new Map() // tid -> {peerId, settle, acked, wake, abortOffer}
  const withdrawn = new Set() // offers the sender cancelled before we answered
  const pendingPairs = new Map() // secret -> {peerId, request, at}

  const hello = room.makeAction('hello')
  const text = room.makeAction('text')
  const chunk = room.makeAction('chunk')
  const ctrl = room.makeAction('ctrl')

  const offer = room.makeAction('offer', {
    kind: 'request',
    onRequest: async (data, {peerId, signal}) => {
      if (!validOffer(data) || incoming.has(data.tid)) return {ok: false}
      const sink = await handlers.onOffer(peerId, data, signal).catch(() => null)
      if (!sink || signal?.aborted || withdrawn.has(data.tid)) {
        sink?.abort()
        return {ok: false}
      }
      startIncoming(peerId, data, sink)
      return {ok: true, flow: true}
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
  }

  room.onPeerLeave = peerId => {
    peers.delete(peerId)
    for (const [tid, t] of incoming) {
      if (t.peerId === peerId) failIncoming(tid, 'failed', false)
    }
    for (const o of outgoing.values()) {
      if (o.peerId === peerId) o.settle?.('failed')
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
      deviceId: String(info.deviceId || '').slice(0, 64),
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
      } else if (msg.t === 'ack') out.settle?.('done')
      else if (msg.t === 'cancel') out.settle?.('cancelled')
      else if (msg.t === 'fail') out.settle?.('failed')
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
    try { t.sink.abort() } catch {}
    if (tellSender) ctrl.send({t: reason === 'cancelled' ? 'cancel' : 'fail', tid}, {target: t.peerId}).catch(() => {})
    handlers.onIncomingFailed(t.peerId, tid, reason)
  }

  chunk.onMessage = (data, {peerId, metadata}) => {
    const tid = metadata?.t
    const t = typeof tid === 'string' && incoming.get(tid)
    if (!t || t.peerId !== peerId || t.done) return
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const {i, o} = metadata
    const file = t.files[i]
    if (!Number.isInteger(i) || !Number.isSafeInteger(o) || !file || o < 0 || o + bytes.length > file.size || !bytes.length) {
      console.warn('nearby: bad chunk', i, o, bytes.length)
      failIncoming(tid, 'failed', true)
      return
    }
    t.lastActivity = Date.now()
    // Frames can overtake each other slightly on the sending side, so put them back in
    // order here. The sender keeps a bounded window, so this buffer stays small.
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

  // Abandon receives that have stopped moving (sender crashed, network vanished...).
  const watchdog = setInterval(() => {
    const now = Date.now()
    for (const [tid, t] of incoming) {
      if (!t.done && now - t.lastActivity > IDLE_TIMEOUT_MS) failIncoming(tid, 'failed', true)
    }
    for (const [secret, p] of pendingPairs) {
      if (now - p.at > PAIR_TIMEOUT_MS + 30_000) pendingPairs.delete(secret)
    }
  }, 5000)

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
        out.settle?.('cancelled')
      }
      if (incoming.has(tid)) failIncoming(tid, 'cancelled', true)
    },

    /**
     * Offer files to a peer, then stream them if accepted.
     * onStatus(state, doneBytes, totalBytes): 'waiting' | 'sending' | 'done' | 'declined' | 'failed' | 'cancelled'
     * onTid(tid) is called first so the caller can cancel.
     */
    async sendFiles(peerId, files, thumbs, onStatus, onTid) {
      const tid = randomId(9)
      const list = files.map((f, i) => ({
        name: f.name || 'file',
        type: f.type || '',
        size: f.size,
        thumb: thumbs[i] || null,
      }))
      const total = list.reduce((s, f) => s + f.size, 0)
      let result = null
      let settleWait
      const settled = new Promise(r => { settleWait = r })
      const abortOffer = new AbortController()
      const out = {
        peerId,
        acked: 0,
        lastAck: Date.now(),
        wake: null,
        settle: state => {
          if (result) return
          result = state
          abortOffer.abort()
          out.wake?.()
          settleWait(state)
        },
      }
      outgoing.set(tid, out)
      onTid?.(tid)
      onStatus('waiting', 0, total)

      try {
        let answer
        try {
          answer = await offer.request({tid, files: list}, {target: peerId, timeoutMs: OFFER_TIMEOUT_MS, signal: abortOffer.signal})
        } catch (err) {
          if (!result) {
            console.warn('nearby: offer failed', err)
            out.settle('failed')
          }
        }
        if (!result && !answer?.ok) out.settle('declined')
        if (result) return onStatus(result, 0, total)

        const flow = !!answer.flow
        const waitForAck = () => new Promise(r => {
          out.wake = r
          setTimeout(r, 1000)
        })

        let sent = 0
        let lastReport = 0
        const report = force => {
          const now = performance.now()
          if (force || now - lastReport > 120) {
            lastReport = now
            onStatus('sending', flow ? out.acked : sent, total)
          }
        }
        // Keep a window of sends queued: Trystero releases waiting frames in order each time
        // the channel buffer drains, so a burst goes out per drain instead of one frame.
        const inflight = []
        let sendError = null
        for (let i = 0; i < files.length && !result && !sendError; i++) {
          const file = files[i]
          for (let pos = 0; pos < file.size && !result && !sendError; pos += READ_BLOCK) {
            // Don't run too far ahead of what the receiver has actually stored.
            while (flow && !result && sent - out.acked > FLOW_WINDOW) {
              if (Date.now() - out.lastAck > IDLE_TIMEOUT_MS) {
                out.settle('failed')
                break
              }
              await waitForAck()
              report()
            }
            if (result) break
            const block = new Uint8Array(await file.slice(pos, pos + READ_BLOCK).arrayBuffer())
            for (let off = 0; off < block.length && !result && !sendError; off += WIRE_CHUNK) {
              // slice (copy), not subarray: the payload must not drag the whole block along
              const piece = block.slice(off, off + WIRE_CHUNK)
              const p = chunk.send(piece, {target: peerId, metadata: {t: tid, i, o: pos + off}})
              p.catch(err => { sendError ??= err })
              inflight.push(p)
              if (inflight.length >= SEND_WINDOW) await inflight.shift().catch(() => {})
              sent += piece.length
              report()
            }
          }
        }
        await Promise.all(inflight.map(p => p.catch(() => {})))
        if (sendError) {
          console.warn('nearby: chunk send failed', sendError)
          out.settle('failed')
        }
        if (!result) {
          report(true)
          const timer = setTimeout(() => out.settle('failed'), ACK_TIMEOUT_MS)
          settled.then(() => clearTimeout(timer))
          // Keep the progress bar moving while the receiver finishes writing.
          while (!result && flow) {
            await waitForAck()
            report()
          }
        }
        onStatus(await settled, flow ? out.acked : sent, total)
      } catch (err) {
        console.warn('nearby: transfer failed', err)
        out.settle('failed')
        onStatus(result, 0, total)
      } finally {
        outgoing.delete(tid)
      }
    },

    /** Safety code: 4 emoji derived from both ends' DTLS certificate fingerprints. */
    async verificationCode(peerId) {
      if (!crypto.subtle) return null
      const pc = room.getPeers()[peerId]
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
      for (const o of outgoing.values()) o.settle?.('failed')
      return room.leave()
    },
  }
}

function validOffer(data) {
  return data && typeof data.tid === 'string' && data.tid.length <= 32 &&
    Array.isArray(data.files) && data.files.length > 0 && data.files.length <= 1000 &&
    data.files.every(f => f && typeof f.name === 'string' && Number.isSafeInteger(f.size) && f.size >= 0 && f.size <= MAX_OFFER_BYTES)
}
