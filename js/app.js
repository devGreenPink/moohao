import {t, lang, setLang, applyStatic} from './i18n.js'
import {createSession, detectNetworkRoom, codeRoom, pairRoom, randomId} from './net.js'
import {newWordCode, parseRoomCode, displayCode, codeWords, isWordCode} from './words.js'
import {notifyState, toggleNotify, notify, closeNotification, onNotificationAction, buzz, bumpBadge, clearBadge} from './notify.js'
import {scannerSupported, runScanner} from './ui/scanner.js'
import {memorySink, diskSink, diskSupported, streamSink, streamSupported, MEMORY_SINK_LIMIT, MEMORY_FALLBACK_LIMIT} from './sinks.js'
import {loadPairs, addPair, removePair, touchPair} from './pairing.js'
import {qrcode} from '../vendor/vendor.js'
import {mascot, ICONS} from './ui/mascot.js'
import {createRadar} from './ui/radar.js'
import {createPanel} from './ui/panel.js'
import {createScanStatus} from './ui/status.js'
import {scatterStars} from './ui/sky.js'

const $ = sel => document.querySelector(sel)

/** After this long with nobody found, switch from "searching" to "not found" + help. */
const SEARCH_GRACE_MS = 15_000

// ---------- small helpers ----------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key)
    localStorage.setItem(key, value)
  } catch {}
  return null
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function ext(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '')
  return m ? m[1] : 'file'
}

function toast(text, ms = 2600) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = text
  $('#toasts').append(el)
  setTimeout(() => el.remove(), ms)
}

/** Announce something to screen readers without showing it. */
function announce(text) {
  const live = $('#sr-live')
  live.textContent = ''
  setTimeout(() => { live.textContent = text }, 50)
}

let audio
function chime() {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(740, t0)
    osc.frequency.exponentialRampToValueAtTime(1180, t0 + 0.09)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3)
    osc.connect(gain).connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + 0.32)
  } catch {}
}

const baseTitle = document.title
function flagTitle() {
  if (document.hidden) document.title = `● ${baseTitle}`
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    document.title = baseTitle
    clearBadge()
  }
})
window.addEventListener('focus', clearBadge)

/** Something the user should know about even if they're in another app. */
function alertUser({title, body, tag, actions, vibrate = true}) {
  if (vibrate) buzz()
  bumpBadge()
  notify({title, body, tag, actions})
}

function fileNames(files) {
  const names = files.slice(0, 3).map(f => f.name)
  return names.join(', ') + (files.length > 3 ? ` +${files.length - 3}` : '')
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

// ---------- who am I ----------

function detectDevice() {
  const ua = navigator.userAgent
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  const device =
    /iPad|Tablet/i.test(ua) || touchMac || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet'
    : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'phone'
    : 'desktop'
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) || touchMac ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : ''
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : ''
  return {device, os, browser}
}

function randomName() {
  const adj = ['Blue', 'Swift', 'Sunny', 'Quiet', 'Brave', 'Lucky', 'Cosmic', 'Mellow', 'Bright', 'Jolly', 'Misty', 'Rapid', 'Gentle', 'Clever', 'Happy', 'Snowy']
  const animal = ['Otter', 'Panda', 'Fox', 'Koala', 'Falcon', 'Tiger', 'Dolphin', 'Owl', 'Rabbit', 'Penguin', 'Lynx', 'Gecko', 'Whale', 'Heron', 'Turtle', 'Elephant']
  const pick = list => list[Math.floor(Math.random() * list.length)]
  return `${pick(adj)} ${pick(animal)}`
}

const me = {
  name: store('nearby.name') || randomName(),
  deviceId: store('nearby.deviceId') || randomId(12),
  ...detectDevice(),
}
store('nearby.name', me.name)
store('nearby.deviceId', me.deviceId)

// ---------- state ----------

const state = {
  main: null, // session for the network / room-code room
  pairSessions: new Map(), // pairId -> session (null while starting)
  mode: 'local', // 'local' | 'room' | 'offline' (network lookup failed)
  code: null,
  netRoom: undefined,
  // peerId -> {info, links: Map(key -> session), busy, status, clearTimer, transfer, code}
  peers: new Map(),
  pending: null, // {kind: 'files', files, shared?} | {kind: 'text', text, shared?}
  targetPeer: null,
  incoming: new Map(), // tid -> {start, total, sink, peerId}
  offerPeer: null,
  searchStart: Date.now(),
  searchTimer: 0,
  retryTimer: 0,
  joinError: null,
  online: navigator.onLine,
}

const allSessions = () => [state.main, ...state.pairSessions.values()].filter(Boolean)

function sessionFor(id) {
  const p = state.peers.get(id)
  if (!p) return null
  return p.links.get('main') || p.links.values().next().value || null
}

function pairFor(id) {
  const p = state.peers.get(id)
  if (!p) return null
  const pairs = loadPairs()
  for (const key of p.links.keys()) {
    if (key.startsWith('pair:')) {
      const rec = pairs.find(x => x.id === key.slice(5))
      if (rec) return rec
    }
  }
  return (p.info.deviceId && pairs.find(x => x.deviceId === p.info.deviceId)) || null
}

// ---------- UI components ----------

function describePeer(info, status, paired) {
  const sys = [info.os, info.browser].filter(Boolean).join(' ')
  const parts = [info.name, t(info.device) + (sys ? ` (${sys})` : '')]
  if (paired) parts.push(t('pairedBadge'))
  if (status?.text) parts.push(status.text)
  return parts.join(', ')
}

const radar = createRadar($('#radar'), {
  onActivate: id => onNodeActivate(id),
  onDropFiles: (id, files) => {
    hideDropOverlay()
    sendFiles(id, files)
  },
  describe: describePeer,
})

const panel = createPanel($('#panel'), {
  onSendFiles: id => pickFilesFor(id),
  onSendText: id => openCompose(id),
  onCancel: id => cancelTransfer(id),
  onPair: id => pairWith(id),
  onUnpair: id => unpairPeer(id),
  onClose: () => {
    const id = radar.selected
    selectPeer(null)
    if (id) radar.focus(id)
  },
  onUseRoom: () => openRoomDialog(),
})

const scan = createScanStatus(document.body)

scatterStars($('#sky'))

// ---------- view refresh ----------

function currentError() {
  if (!state.online) return t('offline')
  if (state.mode === 'offline') return t('ipFailed')
  if (state.joinError) return t('joinError', {msg: state.joinError})
  return null
}

/** Recompute the scan bar, hero and side panel from state. */
function refresh() {
  const count = state.peers.size
  const error = count ? null : currentError()
  let kind
  if (error) kind = 'error'
  else if (count) kind = 'found'
  else kind = Date.now() - state.searchStart < SEARCH_GRACE_MS ? 'searching' : 'none'

  scan.set({kind, count, mode: state.mode, code: state.code && displayCode(state.code, lang), message: error})

  const sel = radar.selected
  if (sel && state.peers.has(sel)) {
    const p = state.peers.get(sel)
    if (p.code === undefined) loadCode(sel)
    panel.render({
      kind: 'peer', id: sel, info: p.info, status: p.status,
      code: p.code, paired: !!pairFor(sel), canCancel: !!p.transfer,
    })
  } else if (kind === 'error') {
    panel.render({kind: 'error', message: error})
  } else if (kind === 'found') {
    panel.render({kind: 'pick'})
  } else {
    panel.render({kind})
  }
  if ($('#dlg-room').open) renderPairList()
}

function restartSearchClock() {
  state.searchStart = Date.now()
  clearTimeout(state.searchTimer)
  state.searchTimer = setTimeout(refresh, SEARCH_GRACE_MS + 50)
}

function updateMode() {
  const dot = $('#mode-dot')
  dot.className = 'dot'
  if (state.mode === 'room') {
    dot.classList.add('room')
    $('#mode-label').textContent = t('modeRoom', {code: displayCode(state.code, lang)})
  } else if (state.mode === 'offline') {
    $('#mode-label').textContent = t('modeOffline')
  } else {
    dot.classList.add('on')
    $('#mode-label').textContent = t('modeLocal')
  }
  refresh()
}

function renderMe() {
  $('#me-name').textContent = me.name
  $('#self').dataset.device = me.device
  $('#self-mascot').innerHTML = mascot(me.device)
  $('#self-label').textContent = `${t('you')}: ${me.name}`
}

// ---------- peers ----------

function linkPeer(id, key, session, info) {
  let p = state.peers.get(id)
  if (!p) {
    p = {info, links: new Map(), busy: false, status: {kind: 'idle'}, clearTimer: 0, transfer: null, code: undefined}
    state.peers.set(id, p)
  }
  p.info = info
  p.links.set(key, session)
  if (key === 'main') state.joinError = null
  if (key.startsWith('pair:')) touchPair(key.slice(5), info)
  radar.upsert(id, info, {paired: !!pairFor(id)})
  refresh()
}

function unlinkPeer(id, key) {
  const p = state.peers.get(id)
  if (!p) return
  p.links.delete(key)
  if (p.links.size) {
    p.code = undefined // the connection used for the safety code may have changed
    refresh()
    return
  }
  clearTimeout(p.clearTimer)
  state.peers.delete(id)
  radar.remove(id)
  if (state.offerPeer === id && $('#dlg-offer').open) $('#dlg-offer').close('no')
  if (!state.peers.size) restartSearchClock()
  refresh()
}

function refreshPairFlags() {
  for (const [id, p] of state.peers) radar.upsert(id, p.info, {paired: !!pairFor(id)})
  refresh()
}

function selectPeer(id) {
  radar.select(id)
  refresh()
  if (id && matchMedia('(max-width: 1080px)').matches) {
    $('#panel').scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})
  }
}

function onNodeActivate(id) {
  if (state.pending) {
    const pending = state.pending
    setPending(null)
    if (pending.kind === 'files') sendFiles(id, pending.files)
    else sendText(id, pending.text)
    return
  }
  selectPeer(id)
}

async function loadCode(id) {
  const p = state.peers.get(id)
  if (!p || p.code !== undefined) return p?.code ?? null
  p.code = undefined
  const code = await sessionFor(id)?.verificationCode(id).catch(() => null)
  const now = state.peers.get(id)
  if (now) {
    now.code = code ?? null
    if (radar.selected === id) refresh()
  }
  return code ?? null
}

const TERMINAL = new Set(['done', 'declined', 'failed', 'cancelled'])

/** kind: idle | waiting | sending | receiving | done | declined | failed | cancelled */
function setPeerStatus(id, kind, {fraction = 0, speed = 0, eta = 0} = {}) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  let text = ''
  let detail = ''
  if (kind === 'waiting') text = t('waiting')
  else if (kind === 'sending' || kind === 'receiving') {
    const pct = Math.floor(fraction * 100)
    text = speed > 0 ? `${pct}% · ${fmtSize(speed)}/s` : `${t(kind)} ${pct}%`
    detail = speed > 0 ? `${t(kind)} ${pct}% · ${fmtSize(speed)}/s · ${t('eta', {t: fmtTime(eta)})}` : text
  } else if (kind !== 'idle') text = t(kind)

  p.status = {kind, fraction, text, detail: detail || text}
  radar.setStatus(id, p.status)
  if (radar.selected === id) refresh()

  if (TERMINAL.has(kind)) {
    announce(`${p.info.name}: ${text}`)
    p.clearTimer = setTimeout(() => setPeerStatus(id, 'idle'), kind === 'done' ? 2500 : 4000)
  }
}

function setProgress(id, kind, done, total, start) {
  const secs = (performance.now() - start) / 1000
  const speed = secs > 0.4 ? done / secs : 0
  setPeerStatus(id, kind, {
    fraction: total ? done / total : 1,
    speed,
    eta: speed > 0 ? (total - done) / speed : 0,
  })
}

// ---------- sending ----------

function pickFilesFor(id) {
  state.targetPeer = id
  const input = $('#file-input')
  input.value = ''
  input.click()
}

$('#file-input').addEventListener('change', e => {
  const files = [...e.target.files]
  const id = state.targetPeer
  state.targetPeer = null
  if (id && files.length) sendFiles(id, files)
})

async function makeThumb(file) {
  if (!/^image\/(png|jpe?g|gif|webp|bmp|avif)$/.test(file.type) || file.size > 40 * 1024 ** 2) return null
  try {
    const bmp = await createImageBitmap(file)
    const size = 96
    const scale = Math.max(size / bmp.width, size / bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const w = bmp.width * scale
    const h = bmp.height * scale
    ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h)
    bmp.close?.()
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return null
  }
}

async function sendFiles(id, files) {
  const p = state.peers.get(id)
  const session = sessionFor(id)
  if (!p || !files.length || !session) return
  if (p.busy) return toast(t('busy'))
  p.busy = true
  let start = 0
  try {
    const thumbs = await Promise.all(files.map((f, i) => (i < 8 ? makeThumb(f) : null)))
    await session.sendFiles(id, files, thumbs,
      (status, sent, total) => {
        if (status === 'sending') {
          start ||= performance.now()
          setProgress(id, 'sending', sent, total, start)
        } else {
          setPeerStatus(id, status)
          const name = p.info.name
          if (status === 'done') alertUser({title: t('nSent', {name}), body: fileNames(files), tag: `sent-${id}`})
          else if (status === 'declined') alertUser({title: t('nDeclined', {name}), body: fileNames(files), tag: `sent-${id}`})
          else if (status === 'failed') alertUser({title: t('nFailed', {name}), body: fileNames(files), tag: `sent-${id}`})
        }
      },
      tid => {
        p.transfer = {tid, session}
        refresh()
      })
  } finally {
    p.busy = false
    p.transfer = null
    refresh()
  }
}

function cancelTransfer(id) {
  const p = state.peers.get(id)
  if (p?.transfer) p.transfer.session.cancel(p.transfer.tid)
}

async function sendText(id, text) {
  const p = state.peers.get(id)
  const session = sessionFor(id)
  if (!p || !text.trim() || !session) return
  try {
    await session.sendText(id, text)
    toast(t('sentTo', {name: p.info.name}))
  } catch {
    toast(t('failed'))
  }
}

function setPending(pending) {
  state.pending = pending
  $('#pending-bar').hidden = !pending
  radar.setPicking(!!pending)
  if (pending) {
    const what = pending.kind === 'files'
      ? t(pending.shared ? 'sharedFiles' : 'pastedFiles', {n: pending.files.length})
      : t(pending.shared ? 'sharedText' : 'pastedText')
    $('#pending-text').textContent = t('pickRecipient', {what: lang === 'th' ? what : ` ${what}`})
    announce($('#pending-text').textContent)
  }
}
$('#pending-cancel').addEventListener('click', () => setPending(null))

// ---------- dialogs ----------

function showDialog(dlg) {
  return new Promise(resolve => {
    dlg.returnValue = ''
    dlg.addEventListener('close', () => resolve(dlg.returnValue), {once: true})
    dlg.showModal()
  })
}

// Incoming offers / files / messages / pair requests are shown one at a time.
const queue = []
let queueRunning = false
function enqueue(task) {
  queue.push(task)
  runQueue()
}
async function runQueue() {
  if (queueRunning) return
  queueRunning = true
  while (queue.length) {
    try { await queue.shift()() } catch (err) { console.error(err) }
  }
  queueRunning = false
}

function fileRow(file, {thumb, url}) {
  const li = document.createElement('li')
  let visual
  if (thumb) {
    visual = document.createElement('img')
    visual.src = thumb
    visual.alt = ''
  } else {
    visual = document.createElement('span')
    visual.textContent = ext(file.name)
  }
  visual.className = 'thumb'
  const meta = document.createElement('div')
  meta.className = 'meta'
  const b = document.createElement('b')
  b.textContent = file.name
  const s = document.createElement('span')
  s.textContent = fmtSize(file.size)
  meta.append(b, s)
  li.append(visual, meta)
  if (url) {
    const a = document.createElement('a')
    a.className = 'btn'
    a.href = url
    a.download = file.name
    a.textContent = t('save')
    li.append(a)
  }
  return li
}

function safeThumb(thumb) {
  return typeof thumb === 'string' && thumb.startsWith('data:image/jpeg;base64,') && thumb.length < 80_000 ? thumb : null
}

/**
 * Pick where the incoming bytes go. Runs right after the Accept click, so the folder /
 * save picker (Chrome, Edge) is still allowed to open.
 */
async function chooseSink(files, total) {
  if (total <= MEMORY_SINK_LIMIT) return memorySink(files)
  if (diskSupported(files.length)) {
    try {
      return await diskSink(files)
    } catch (err) {
      if (err?.name === 'AbortError') return null // user closed the picker: treat as decline
    }
  }
  if (streamSupported()) return streamSink(files)
  if (total <= MEMORY_FALLBACK_LIMIT) return memorySink(files)
  toast(t('tooBigHere', {size: fmtSize(total)}), 5000)
  return null
}

function askOffer(peerId, data, signal, session) {
  return new Promise(resolve => enqueue(async () => {
    const peer = state.peers.get(peerId)
    if (signal?.aborted || !peer) return resolve(null)
    const total = data.files.reduce((s, f) => s + f.size, 0)
    $('#offer-title').textContent = t('incomingTitle', {name: peer.info.name})
    $('#offer-summary').textContent = t('filesCount', {n: data.files.length, size: fmtSize(total)})
    $('#offer-files').replaceChildren(...data.files.slice(0, 50).map(f => fileRow(f, {thumb: safeThumb(f.thumb)})))
    const code = await session.verificationCode(peerId).catch(() => null)
    $('#offer-verify').hidden = !code
    $('#offer-code').textContent = code || ''

    const dlg = $('#dlg-offer')
    const abort = () => dlg.open && dlg.close('no')
    signal?.addEventListener('abort', abort, {once: true})
    const timer = setTimeout(abort, 4.5 * 60 * 1000)
    const tag = `offer-${data.tid}`
    state.offerPeer = peerId
    state.offerTag = tag
    chime()
    flagTitle()
    alertUser({
      title: t('nOffer', {name: peer.info.name}),
      body: `${t('filesCount', {n: data.files.length, size: fmtSize(total)})}\n${fileNames(data.files)}`,
      tag,
      actions: [{action: 'accept', title: t('accept')}, {action: 'decline', title: t('decline')}],
    })
    const answer = await showDialog(dlg)
    state.offerPeer = null
    state.offerTag = null
    closeNotification(tag)
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)

    if (answer !== 'yes' || signal?.aborted || !state.peers.has(peerId)) return resolve(null)
    const sink = await chooseSink(data.files, total)
    if (!sink) return resolve(null)
    state.incoming.set(data.tid, {start: performance.now(), total, sink, peerId, count: data.files.length, files: data.files})
    const p = state.peers.get(peerId)
    if (p) p.transfer = {tid: data.tid, session}
    setPeerStatus(peerId, 'receiving', {fraction: 0})
    resolve(sink)
  }))
}

function onIncomingDone(peerId, tid) {
  const inc = state.incoming.get(tid)
  state.incoming.delete(tid)
  const p = state.peers.get(peerId)
  if (p) p.transfer = null
  setPeerStatus(peerId, 'done', {fraction: 1})
  if (!inc) return
  const name = p?.info.name || '?'
  alertUser({title: t('nReceived', {n: inc.count, name}), body: fileNames(inc.files), tag: `recv-${tid}`})
  if (inc.sink.kind === 'memory') showReceived(peerId, inc.sink.results)
  else if (inc.sink.kind === 'disk') toast(t('savedToDisk', {n: inc.count}), 4000)
  else toast(t('downloadSaved'), 4000)
}

function onIncomingFailed(peerId, tid, reason) {
  state.incoming.delete(tid)
  const p = state.peers.get(peerId)
  if (p) p.transfer = null
  setPeerStatus(peerId, reason === 'cancelled' ? 'cancelled' : 'failed')
}

function showReceived(peerId, files) {
  const name = state.peers.get(peerId)?.info.name || '?'
  enqueue(async () => {
    const urls = files.map(f => URL.createObjectURL(f.blob))
    $('#received-title').textContent = t('receivedTitle', {name})
    $('#received-files').replaceChildren(...files.map((f, i) =>
      fileRow(f, {url: urls[i], thumb: /^image\//.test(f.type) ? urls[i] : null})))
    $('#received-all').hidden = files.length < 2
    chime()
    flagTitle()
    await showDialog($('#dlg-received'))
    // Give any download that was just started time to finish before releasing memory.
    setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60_000)
  })
}

$('#received-all').addEventListener('click', async () => {
  const links = [...$('#received-files').querySelectorAll('a[download]')]
  for (const a of links) {
    a.click()
    await new Promise(r => setTimeout(r, 400))
  }
})

function linkFrom(text) {
  const s = text.trim()
  if (/\s/.test(s)) return null
  try {
    const url = new URL(s)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function showMessage(peerId, text) {
  const name = state.peers.get(peerId)?.info.name || '?'
  enqueue(async () => {
    $('#message-title').textContent = t('messageFrom', {name})
    $('#message-body').textContent = text
    const link = linkFrom(text)
    const open = $('#message-open')
    open.hidden = !link
    if (link) open.href = link
    else open.removeAttribute('href')
    const copy = $('#message-copy')
    copy.textContent = t('copy')
    copy.onclick = async () => {
      if (await copyText(text)) copy.textContent = t('copied')
    }
    chime()
    flagTitle()
    alertUser({title: t('messageFrom', {name}), body: text.slice(0, 140), tag: `msg-${peerId}`})
    await showDialog($('#dlg-message'))
  })
}

let composePeer = null
function openCompose(id, prefill = '') {
  const p = state.peers.get(id)
  if (!p) return
  composePeer = id
  $('#compose-title').textContent = t('sendTextTo', {name: p.info.name})
  const ta = $('#compose-text')
  ta.value = prefill
  showDialog($('#dlg-compose')).then(v => {
    if (v === 'send' && composePeer) sendText(composePeer, ta.value)
    composePeer = null
  })
  setTimeout(() => ta.focus(), 50)
}
$('#compose-text').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    $('#dlg-compose').close('send')
  }
})

// ---------- pairing ----------

async function ensurePairSession(record) {
  if (state.pairSessions.has(record.id)) return
  state.pairSessions.set(record.id, null) // reserve while the room id is derived
  const config = await pairRoom(record.secret)
  if (!state.pairSessions.has(record.id)) return // unpaired meanwhile
  state.pairSessions.set(record.id, createSession(config, me, makeHandlers(`pair:${record.id}`)))
}

function stopPairSession(id) {
  const session = state.pairSessions.get(id)
  state.pairSessions.delete(id)
  for (const peerId of [...state.peers.keys()]) unlinkPeer(peerId, `pair:${id}`)
  session?.leave().catch(() => {})
}

async function pairWith(id) {
  const p = state.peers.get(id)
  const session = sessionFor(id)
  if (!p || !session) return
  toast(t('pairWaiting'), 4000)
  const secret = randomId(24)
  const res = await session.requestPair(id, secret)
  if (!res.ok) return toast(t('pairDeclined'))
  const record = await addPair({secret, name: res.name || p.info.name, deviceId: res.deviceId || p.info.deviceId})
  await ensurePairSession(record)
  toast(t('pairDone', {name: record.name}))
  alertUser({title: t('nPairDone', {name: record.name}), tag: `pair-${record.id}`})
  refreshPairFlags()
}

function askPair(peerId, request, signal, session) {
  return new Promise(resolve => enqueue(async () => {
    const peer = state.peers.get(peerId)
    if (signal?.aborted || !peer) return resolve(false)
    const code = await session.verificationCode(peerId).catch(() => null)
    $('#pair-title').textContent = t('pairTitle', {name: request.name || peer.info.name})
    $('#pair-code').textContent = code || '—'
    const dlg = $('#dlg-pair')
    const abort = () => dlg.open && dlg.close('no')
    signal?.addEventListener('abort', abort, {once: true})
    chime()
    flagTitle()
    const tag = `pairreq-${peerId}`
    alertUser({
      title: t('nPairRequest', {name: request.name || peer.info.name}),
      body: code ? t('nPairCode', {code}) : '',
      tag,
    })
    const answer = await showDialog(dlg)
    closeNotification(tag)
    signal?.removeEventListener('abort', abort)
    if (answer !== 'yes' || signal?.aborted) return resolve(false)
    const record = await addPair({secret: request.secret, name: request.name || peer.info.name, deviceId: request.deviceId || peer.info.deviceId})
    await ensurePairSession(record)
    toast(t('pairDone', {name: record.name}))
    alertUser({title: t('nPairDone', {name: record.name}), tag: `pair-${record.id}`, vibrate: false})
    refreshPairFlags()
    resolve(true)
  }))
}

function unpairRecord(record, notifyPeerId) {
  if (notifyPeerId) sessionFor(notifyPeerId)?.tellUnpair(notifyPeerId, record.id)
  removePair(record.id)
  // Leave the room a moment later so the "unpair" message can go out on it.
  setTimeout(() => stopPairSession(record.id), 800)
  toast(t('unpaired', {name: record.name}))
  refreshPairFlags()
}

function unpairPeer(id) {
  const record = pairFor(id)
  if (!record || !confirm(t('unpairConfirm', {name: record.name}))) return
  unpairRecord(record, id)
}

function onRemoteUnpair(peerId, pairId) {
  const record = loadPairs().find(p => p.id === pairId)
  if (record) unpairRecord(record, null)
}

function renderPairList() {
  const pairs = loadPairs()
  const list = $('#pair-list')
  $('#pairs-empty').hidden = pairs.length > 0
  list.replaceChildren(...pairs.map(rec => {
    const online = [...state.peers.values()].some(p => p.links.has(`pair:${rec.id}`) || (rec.deviceId && p.info.deviceId === rec.deviceId))
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.className = 'pair-name'
    name.textContent = rec.name
    const st = document.createElement('span')
    st.className = `pair-state${online ? ' on' : ''}`
    st.textContent = online ? t('online') : t('notConnected')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn small ghost'
    btn.textContent = t('unpair')
    btn.addEventListener('click', () => {
      if (!confirm(t('unpairConfirm', {name: rec.name}))) return
      const peerId = [...state.peers.entries()].find(([, p]) => p.links.has(`pair:${rec.id}`) || (rec.deviceId && p.info.deviceId === rec.deviceId))?.[0]
      unpairRecord(rec, peerId || null)
      renderPairList()
    })
    li.append(name, st, btn)
    return li
  }))
}

// ---------- sessions & rooms ----------

function makeHandlers(key) {
  const self = () => (key === 'main' ? state.main : state.pairSessions.get(key.slice(5)))
  return {
    onPeer: (id, info) => (info ? linkPeer(id, key, self(), info) : unlinkPeer(id, key)),
    onOffer: (id, offer, signal) => askOffer(id, offer, signal, self()),
    onIncomingProgress: (id, tid, received, total) => {
      const inc = state.incoming.get(tid)
      if (inc) setProgress(id, 'receiving', received, total, inc.start)
    },
    onIncomingDone,
    onIncomingFailed,
    onText: showMessage,
    onPairRequest: (id, request, signal) => askPair(id, request, signal, self()),
    onUnpair: onRemoteUnpair,
    onError: msg => {
      if (key !== 'main') return
      state.joinError = String(msg || '').slice(0, 120) || '?'
      refresh()
    },
  }
}

function roomUrl(code) {
  return `${location.origin}${location.pathname}#r=${code}`
}

function codeFromHashString(hash) {
  const m = /[#&]r=([^&]+)/.exec(hash || '')
  if (!m) return null
  try {
    return parseRoomCode(decodeURIComponent(m[1]))
  } catch {
    return null
  }
}

function codeFromHash() {
  return codeFromHashString(location.hash)
}

/** A scanned QR / pasted text -> room code, if it's one of ours. */
function codeFromText(text) {
  const s = String(text || '').trim()
  try {
    const url = new URL(s)
    return codeFromHashString(url.hash)
  } catch {
    return parseRoomCode(s)
  }
}

async function switchSession(config) {
  const old = state.main
  state.main = null
  state.joinError = null
  for (const id of [...state.peers.keys()]) unlinkPeer(id, 'main')
  restartSearchClock()
  refresh()
  if (old) await old.leave().catch(() => {})
  if (config) state.main = createSession(config, me, makeHandlers('main'))
}

async function enterRoom(code) {
  state.mode = 'room'
  state.code = code
  if (codeFromHash() !== code) history.replaceState(null, '', `${location.pathname}${location.search}#r=${code}`)
  updateMode()
  await switchSession(codeRoom(code))
}

async function enterLocal() {
  state.code = null
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  state.mode = 'local'
  updateMode()
  if (!state.netRoom) state.netRoom = await detectNetworkRoom()
  if (state.mode !== 'local' && state.mode !== 'offline') return // switched to a room meanwhile
  if (!state.netRoom) {
    state.mode = 'offline'
    await switchSession(null)
    updateMode()
    // Keep retrying quietly; a flaky lookup shouldn't leave the user stuck.
    clearTimeout(state.retryTimer)
    state.retryTimer = setTimeout(() => {
      if (state.mode === 'offline') enterLocal()
    }, 20_000)
    return
  }
  state.mode = 'local'
  updateMode()
  await switchSession(state.netRoom)
}

function renderRoomDialog() {
  const inRoom = state.mode === 'room'
  $('#room-active').hidden = !inRoom
  $('#room-idle').hidden = inRoom
  $('#room-error').hidden = true
  $('#room-scan').hidden = !scannerSupported()
  if (inRoom) {
    const codeEl = $('#room-code')
    const words = isWordCode(state.code)
    codeEl.classList.toggle('words', words)
    codeEl.replaceChildren(...codeWords(state.code, lang).map(w => {
      const span = document.createElement('span')
      span.textContent = w
      return span
    }))
    codeEl.setAttribute('aria-label', displayCode(state.code, lang))
    $('#room-code-alt').hidden = !words
    $('.code-say').hidden = !words
    if (words) $('#room-code-alt').textContent = t('codeAlt', {code: displayCode(state.code, lang === 'th' ? 'en' : 'th')})
    const qr = qrcode(0, 'M')
    qr.addData(roomUrl(state.code))
    qr.make()
    $('#room-qr').innerHTML = qr.createSvgTag({cellSize: 5, margin: 2, scalable: true})
  }
  renderPairList()
}

function openRoomDialog() {
  renderRoomDialog()
  $('#room-input').value = ''
  showDialog($('#dlg-room'))
}

$('#btn-room').addEventListener('click', openRoomDialog)
$('#room-create').addEventListener('click', async () => {
  await enterRoom(newWordCode())
  renderRoomDialog()
})
function joinTyped() {
  const code = codeFromText($('#room-input').value)
  if (!code) {
    $('#room-error').textContent = t('badCode')
    $('#room-error').hidden = false
    $('#room-input').focus()
    return
  }
  $('#dlg-room').close()
  enterRoom(code)
}
$('#room-input').addEventListener('input', () => { $('#room-error').hidden = true })

$('#room-scan').addEventListener('click', () => {
  const dialog = $('#dlg-scan')
  let found = null
  showDialog(dialog).then(() => {
    if (!found) return
    if ($('#dlg-room').open) $('#dlg-room').close()
    if (found !== state.code) enterRoom(found)
  })
  runScanner({
    dialog,
    video: $('#scan-video'),
    setStatus: key => { $('#scan-status').textContent = t(key) },
    accept: text => (found = codeFromText(text)),
  })
})
$('#room-join').addEventListener('click', joinTyped)
$('#room-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    joinTyped()
  }
})
$('#room-copy').addEventListener('click', async () => {
  if (await copyText(roomUrl(state.code))) toast(t('linkCopied'))
})
$('#room-leave').addEventListener('click', () => {
  $('#dlg-room').close()
  enterLocal()
})

window.addEventListener('hashchange', () => {
  const code = codeFromHash()
  if (code && code !== state.code) enterRoom(code)
})

window.addEventListener('online', () => {
  state.online = true
  // A failed network lookup may have been caused by being offline; try again.
  if (state.mode === 'offline') enterLocal()
  else refresh()
})
window.addEventListener('offline', () => {
  state.online = false
  refresh()
})

// ---------- paste & drop anywhere ----------

function typingOrModal() {
  const a = document.activeElement
  return a?.matches?.('input, textarea, [contenteditable="true"]') || !!document.querySelector('dialog[open]')
}

document.addEventListener('paste', e => {
  if (typingOrModal()) return
  const files = [...(e.clipboardData?.files || [])]
  if (files.length) {
    e.preventDefault()
    setPending({kind: 'files', files})
    return
  }
  const text = e.clipboardData?.getData('text/plain')
  if (text?.trim()) {
    e.preventDefault()
    setPending({kind: 'text', text})
  }
})

let dragDepth = 0
function hideDropOverlay() {
  dragDepth = 0
  $('#drop-overlay').hidden = true
}
window.addEventListener('dragenter', e => {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  $('#drop-overlay').hidden = false
})
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) $('#drop-overlay').hidden = true
})
window.addEventListener('dragover', e => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
})
window.addEventListener('drop', e => {
  e.preventDefault()
  hideDropOverlay()
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  const target = radar.selected || (state.peers.size === 1 ? [...state.peers.keys()][0] : null)
  if (target) sendFiles(target, files)
  else setPending({kind: 'files', files})
})

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
  if (state.pending) setPending(null)
  else if (radar.selected) {
    const id = radar.selected
    selectPeer(null)
    radar.focus(id)
  }
})

// ---------- files shared from other apps (Android share sheet) ----------

async function takeSharedItems() {
  const params = new URLSearchParams(location.search)
  if (!params.has('shared')) return
  history.replaceState(null, '', location.pathname + location.hash)
  if (!('caches' in window)) return
  try {
    const cache = await caches.open('nearby-share')
    const metaRes = await cache.match(new URL('__share/meta', location.href).href)
    if (!metaRes) return
    const meta = await metaRes.json()
    const files = []
    for (const f of meta.files || []) {
      const res = await cache.match(f.key)
      if (res) files.push(new File([await res.blob()], f.name, {type: f.type}))
    }
    await caches.delete('nearby-share')
    if (files.length) setPending({kind: 'files', files, shared: true})
    else if (meta.text) setPending({kind: 'text', text: meta.text, shared: true})
  } catch {}
}

// ---------- install (PWA) ----------

let installPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  installPrompt = e
  $('#btn-install').hidden = false
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  $('#btn-install').hidden = true
})
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return
  installPrompt.prompt()
  await installPrompt.userChoice.catch(() => {})
  installPrompt = null
  $('#btn-install').hidden = true
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

// ---------- notifications ----------

function renderNotifyButton() {
  const btn = $('#btn-notify')
  const st = notifyState()
  btn.hidden = st === 'unsupported'
  btn.dataset.state = st
  btn.innerHTML = st === 'on' ? ICONS.bell : ICONS.bellOff
  const label = st === 'on' ? t('notifyOn') : st === 'blocked' ? t('notifyBlocked') : t('notifyOff')
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.setAttribute('aria-pressed', String(st === 'on'))
}

$('#btn-notify').addEventListener('click', async () => {
  if (notifyState() === 'blocked') return toast(t('notifyBlocked'), 4000)
  const st = await toggleNotify()
  renderNotifyButton()
  if (st === 'on') toast(t('notifyEnabled'), 3500)
  else if (st === 'off') toast(t('notifyDisabled'))
  else if (st === 'blocked') toast(t('notifyBlocked'), 4000)
})

// Buttons pressed on a notification (Accept / Decline on an incoming offer).
onNotificationAction(({action, tag}) => {
  const dlg = $('#dlg-offer')
  if (tag && tag === state.offerTag && dlg.open) {
    if (action === 'accept') dlg.close('yes')
    else if (action === 'decline') dlg.close('no')
  }
})

// ---------- header controls ----------

function isLight() {
  return document.documentElement.dataset.theme === 'light'
}
function renderThemeIcon() {
  $('#btn-theme').innerHTML = isLight() ? ICONS.moon : ICONS.sun
}
$('#btn-theme').addEventListener('click', () => {
  const next = isLight() ? 'dark' : 'light'
  document.documentElement.dataset.theme = next
  store('nearby.theme', next)
  renderThemeIcon()
})

function applyLanguage() {
  applyStatic()
  $('#radar-nodes').setAttribute('aria-label', t('radarLabel'))
  renderNotifyButton()
  if ($('#dlg-room').open) renderRoomDialog()
  renderMe()
  updateMode()
  for (const [id, p] of state.peers) {
    radar.upsert(id, p.info, {paired: !!pairFor(id)})
    if (p.status.kind !== 'idle') setPeerStatus(id, p.status.kind, {fraction: p.status.fraction})
  }
}

$('#btn-lang').addEventListener('click', () => {
  setLang(lang === 'th' ? 'en' : 'th')
  applyLanguage()
})

$('#me-name').addEventListener('click', () => {
  const next = prompt(t('renamePrompt'), me.name)?.trim().slice(0, 40)
  if (!next || next === me.name) return
  me.name = next
  store('nearby.name', next)
  renderMe()
  for (const s of allSessions()) s.announce({name: next})
})

// ---------- start ----------

renderThemeIcon()
applyLanguage()
takeSharedItems()
for (const record of loadPairs()) ensurePairSession(record)

const startCode = codeFromHash()
if (startCode) enterRoom(startCode)
else enterLocal()
