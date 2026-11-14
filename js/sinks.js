// Where incoming file bytes go. Every sink has the same shape:
//   write(fileIndex, Uint8Array), closeFile(fileIndex), finish(), abort()
// plus `kind` and, for the memory sink, `results` once finished.

import {randomId} from './net.js'

const COALESCE_BYTES = 1024 * 1024

/** Transfers up to this size are kept in memory so they can be previewed. */
export const MEMORY_SINK_LIMIT = 256 * 1024 ** 2

/** Absolute cap when no streaming option exists (e.g. iOS Safari). */
export const MEMORY_FALLBACK_LIMIT = 2 * 1024 ** 3

/** Groups the ~15 KB network chunks into 1 MB writes. */
function coalescer(flush) {
  let buf = new Uint8Array(COALESCE_BYTES)
  let len = 0
  return {
    async push(bytes) {
      if (len + bytes.length > buf.length) await this.drain()
      if (bytes.length >= buf.length) return flush(bytes.slice())
      buf.set(bytes, len)
      len += bytes.length
    },
    async drain() {
      if (!len) return
      const out = buf.slice(0, len)
      len = 0
      await flush(out)
    },
  }
}

/**
 * A file name as the sender gave it, minus invisible characters that change how it reads:
 * direction overrides (U+202A–202E, U+2066–2069, U+200E/F) can show "x[RLO]gpj.exe" as
 * "xexe.jpg", hiding the real type.
 */
export function cleanFileName(name) {
  return String(name || '').replace(/[‎‏‪-‮⁦-⁩]/g, '').slice(0, 255) || 'file'
}

export function safeFileName(name) {
  const clean = cleanFileName(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 200)
  return clean || 'file'
}

// ---------- memory ----------

export function memorySink(files) {
  const parts = files.map(() => [])
  // Wrap each 1 MB piece in a Blob straight away: blob data lives in the browser's blob
  // store (which can spill to disk), not the JS heap, so a big receive doesn't balloon
  // the page's memory and the final Blob is assembled without another full copy.
  const co = files.map((_, i) => coalescer(b => { parts[i]?.push(new Blob([b])) }))
  const results = []
  return {
    kind: 'memory',
    results,
    write: (i, bytes) => co[i].push(bytes),
    async closeFile(i) {
      await co[i].drain()
      const f = files[i]
      const blob = new Blob(parts[i] || [], {type: f.type || 'application/octet-stream'})
      results[i] = {name: f.name, type: f.type, size: blob.size, blob}
      parts[i] = null
    },
    finish: async () => {},
    abort() { parts.fill(null) },
  }
}

// ---------- disk (File System Access API: Chrome / Edge desktop) ----------

export function diskSupported(count) {
  return count === 1 ? 'showSaveFilePicker' in window : 'showDirectoryPicker' in window
}

async function uniqueName(dir, name) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 0; n < 1000; n++) {
    const candidate = n ? `${base} (${n})${ext}` : name
    try {
      await dir.getFileHandle(candidate)
    } catch {
      return candidate
    }
  }
  return `${base}-${Date.now()}${ext}`
}

/** Must be called during a user gesture. Throws AbortError if the user cancels the picker. */
export async function diskSink(files) {
  let getHandle
  // How to delete a file we created but didn't finish (so a failed or cancelled transfer
  // leaves no empty or half-written file behind).
  let discard
  if (files.length === 1) {
    // The save picker has already created the (empty) file at this point.
    const handle = await window.showSaveFilePicker({suggestedName: safeFileName(files[0].name)})
    getHandle = async () => handle
    discard = async () => handle.remove?.()
  } else {
    const dir = await window.showDirectoryPicker({id: 'nearby', mode: 'readwrite'})
    const names = []
    getHandle = async i => dir.getFileHandle((names[i] = await uniqueName(dir, safeFileName(files[i].name))), {create: true})
    discard = async i => names[i] && dir.removeEntry(names[i])
  }

  const writers = []
  const open = async i => (writers[i] ??= (await getHandle(i)).createWritable())
  const co = files.map((_, i) => coalescer(async b => (await open(i)).write(b)))
  const closed = new Set()

  return {
    kind: 'disk',
    write: (i, bytes) => co[i].push(bytes),
    async closeFile(i) {
      await co[i].drain()
      await (await open(i)).close()
      closed.add(i)
    },
    finish: async () => {},
    abort() {
      // Files that arrived complete are kept; unfinished ones are thrown away and removed.
      files.forEach((_, i) => {
        if (closed.has(i)) return
        const w = writers[i]
        if (!w && files.length > 1) return // never created
        Promise.resolve(w)
          .then(x => x?.abort())
          .catch(() => {})
          .then(() => discard(i))
          .catch(() => {})
      })
    },
  }
}

// ---------- streamed download through the service worker ----------

export function streamSupported() {
  return !!navigator.serviceWorker?.controller && typeof ReadableStream === 'function'
}

function registerDownload(meta) {
  return new Promise((resolve, reject) => {
    const ch = new MessageChannel()
    const timer = setTimeout(() => reject(new Error('service worker did not answer')), 5000)
    ch.port1.onmessage = e => {
      clearTimeout(timer)
      ch.port1.onmessage = null
      if (e.data === 'ready') resolve(ch.port1)
      else reject(new Error('service worker refused'))
    }
    navigator.serviceWorker.controller.postMessage({type: 'nearby-dl', ...meta}, [ch.port2])
  })
}

export function downloadUrl(id, name) {
  return new URL(`__dl/${id}/${encodeURIComponent(name)}`, location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '')).href
}

/**
 * Each file becomes a normal browser download whose body is fed chunk by chunk, so it goes
 * straight to the Downloads folder without being held in memory.
 */
export function streamSink(files) {
  const opened = []
  // A service worker that only receives MessagePort traffic can look idle and be stopped
  // by the browser mid-download; a regular ping (an extendable event) keeps it alive.
  let keepAlive = 0
  const startKeepAlive = () => {
    keepAlive ||= setInterval(() => navigator.serviceWorker.controller?.postMessage({type: 'nearby-keepalive'}), 10_000)
  }
  const stopKeepAlive = () => {
    clearInterval(keepAlive)
    keepAlive = 0
  }
  const open = i => (opened[i] ??= (async () => {
    startKeepAlive()
    const id = randomId(12)
    const name = safeFileName(files[i].name)
    const port = await registerDownload({id, name, size: files[i].size, mime: files[i].type || 'application/octet-stream'})
    const frame = document.createElement('iframe')
    frame.hidden = true
    frame.src = downloadUrl(id, name)
    document.body.append(frame)
    return {port, frame}
  })())
  const co = files.map((_, i) => coalescer(async b => {
    const {port} = await open(i)
    port.postMessage(b, [b.buffer])
  }))

  const cleanup = entry => setTimeout(() => entry.frame.remove(), 60_000)

  return {
    kind: 'stream',
    write: (i, bytes) => co[i].push(bytes),
    async closeFile(i) {
      await co[i].drain()
      const entry = await open(i)
      entry.port.postMessage('end')
      cleanup(entry)
    },
    // Keep pinging a little longer so the browser finishes writing the last bytes.
    finish: async () => { setTimeout(stopKeepAlive, 30_000) },
    abort() {
      stopKeepAlive()
      opened.forEach(p => p?.then(entry => {
        entry.port.postMessage('abort')
        cleanup(entry)
      }).catch(() => {}))
    },
  }
}
