import {t, lang, setLang, applyStatic} from './i18n.js'
import {createSession, detectNetworkRoom, codeRoom, newRoomCode, normalizeCode, MAX_FILE_BYTES} from './net.js'
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
  if (!document.hidden) document.title = baseTitle
})

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

const me = {name: store('nearby.name') || randomName(), ...detectDevice()}
store('nearby.name', me.name)

// ---------- state ----------

const state = {
  session: null,
  mode: 'local', // 'local' | 'room' | 'offline' (network lookup failed)
  code: null,
  netRoom: undefined, // undefined = not looked up yet, null = failed
  peers: new Map(), // peerId -> {info, busy, status, clearTimer}
  pending: null, // {kind: 'files', files} | {kind: 'text', text}
  targetPeer: null, // peer chosen before opening the file picker
  incoming: new Map(), // tid -> {start, total}
  offerPeer: null, // peer whose offer dialog is open
  searchStart: Date.now(),
  searchTimer: 0,
  joinError: null,
  online: navigator.onLine,
}

// ---------- UI components ----------

function describePeer(info, status) {
  const sys = [info.os, info.browser].filter(Boolean).join(' ')
  const parts = [info.name, t(info.device) + (sys ? ` (${sys})` : '')]
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

  scan.set({kind, count, mode: state.mode, code: state.code, message: error})

  const sel = radar.selected
  if (sel && state.peers.has(sel)) {
    const p = state.peers.get(sel)
    panel.render({kind: 'peer', id: sel, info: p.info, status: p.status})
  } else if (kind === 'error') {
    panel.render({kind: 'error', message: error})
  } else if (kind === 'found') {
    panel.render({kind: 'pick'})
  } else {
    panel.render({kind})
  }
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
    $('#mode-label').textContent = t('modeRoom', {code: state.code})
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

function upsertPeer(id, info) {
  const known = state.peers.get(id)
  if (known) known.info = info
  else state.peers.set(id, {info, busy: false, status: {kind: 'idle'}, clearTimer: 0})
  state.joinError = null
  radar.upsert(id, info)
  refresh()
}

function removePeer(id) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  state.peers.delete(id)
  radar.remove(id)
  if (state.offerPeer === id && $('#dlg-offer').open) $('#dlg-offer').close('no')
  if (!state.peers.size) restartSearchClock()
  refresh()
}

function clearPeers() {
  for (const id of [...state.peers.keys()]) removePeer(id)
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

/** kind: waiting | sending | receiving | done | declined | failed | idle */
function setPeerStatus(id, kind, fraction = 0, speed = 0) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  let text = ''
  if (kind === 'waiting') text = t('waiting')
  else if (kind === 'sending' || kind === 'receiving') {
    const pct = Math.floor(fraction * 100)
    text = speed > 0 ? `${t(kind)} ${pct}% · ${fmtSize(speed)}/s` : `${t(kind)} ${pct}%`
  } else if (kind !== 'idle') text = t(kind)

  p.status = {kind, fraction, text}
  radar.setStatus(id, p.status)
  if (radar.selected === id) refresh()

  if (kind === 'done' || kind === 'declined' || kind === 'failed') {
    announce(`${p.info.name}: ${text}`)
    p.clearTimer = setTimeout(() => setPeerStatus(id, 'idle'), kind === 'done' ? 2500 : 4000)
  }
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
  if (!p || !files.length || !state.session) return
  if (p.busy) return toast(t('busy'))
  if (files.some(f => f.size > MAX_FILE_BYTES)) return toast(t('tooBig', {size: fmtSize(MAX_FILE_BYTES)}))
  p.busy = true
  try {
    const thumbs = await Promise.all(files.map((f, i) => (i < 8 ? makeThumb(f) : null)))
    await state.session.sendFiles(id, files, thumbs, (status, fraction, speed) => setPeerStatus(id, status, fraction, speed))
  } finally {
    p.busy = false
  }
}

async function sendText(id, text) {
  const p = state.peers.get(id)
  if (!p || !text.trim() || !state.session) return
  try {
    await state.session.sendText(id, text)
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
    const what = pending.kind === 'files' ? t('pastedFiles', {n: pending.files.length}) : t('pastedText')
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

// Incoming offers / files / messages are shown one at a time.
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

function validOffer(data) {
  return data && typeof data.tid === 'string' && Array.isArray(data.files) && data.files.length > 0 && data.files.length <= 1000 &&
    data.files.every(f => f && typeof f.name === 'string' && Number.isFinite(f.size) && f.size >= 0 && f.size <= MAX_FILE_BYTES)
}

function safeThumb(thumb) {
  return typeof thumb === 'string' && thumb.startsWith('data:image/jpeg;base64,') && thumb.length < 80_000 ? thumb : null
}

function askOffer(peerId, data, signal) {
  return new Promise(resolve => enqueue(async () => {
    const peer = state.peers.get(peerId)
    if (signal?.aborted || !peer || !validOffer(data)) return resolve(false)
    const total = data.files.reduce((s, f) => s + f.size, 0)
    $('#offer-title').textContent = t('incomingTitle', {name: peer.info.name})
    $('#offer-summary').textContent = t('filesCount', {n: data.files.length, size: fmtSize(total)})
    $('#offer-files').replaceChildren(...data.files.slice(0, 50).map(f => fileRow(f, {thumb: safeThumb(f.thumb)})))

    const dlg = $('#dlg-offer')
    const abort = () => dlg.open && dlg.close('no')
    signal?.addEventListener('abort', abort, {once: true})
    const timer = setTimeout(abort, 4.5 * 60 * 1000)
    state.offerPeer = peerId
    chime()
    flagTitle()
    const answer = await showDialog(dlg)
    state.offerPeer = null
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)

    const ok = answer === 'yes' && !signal?.aborted && state.peers.has(peerId)
    if (ok) {
      state.incoming.set(data.tid, {start: performance.now(), total})
      setPeerStatus(peerId, 'receiving', 0)
    }
    resolve(ok)
  }))
}

function showReceived(peerId, tid, files) {
  state.incoming.delete(tid)
  setPeerStatus(peerId, 'done', 1)
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

// ---------- rooms ----------

function roomUrl(code) {
  return `${location.origin}${location.pathname}#r=${code}`
}

function codeFromHash() {
  const m = /[#&]r=([A-Za-z0-9]+)/.exec(location.hash)
  const code = m ? normalizeCode(m[1]) : ''
  return code.length >= 4 ? code : null
}

const sessionHandlers = {
  onPeer: (id, info) => (info ? upsertPeer(id, info) : removePeer(id)),
  onOffer: askOffer,
  onIncomingProgress: (id, tid, fraction) => {
    const info = state.incoming.get(tid)
    const secs = info ? (performance.now() - info.start) / 1000 : 0
    setPeerStatus(id, 'receiving', fraction, info && secs > 0.3 ? (fraction * info.total) / secs : 0)
  },
  onFilesReceived: showReceived,
  onIncomingFailed: (id, tid) => {
    state.incoming.delete(tid)
    setPeerStatus(id, 'failed')
  },
  onText: showMessage,
  onError: msg => {
    state.joinError = String(msg || '').slice(0, 120) || '?'
    refresh()
  },
}

async function switchSession(config) {
  const old = state.session
  state.session = null
  state.joinError = null
  clearPeers()
  restartSearchClock()
  refresh()
  if (old) await old.leave().catch(() => {})
  if (config) state.session = createSession(config, me, sessionHandlers)
}

async function enterRoom(code) {
  state.mode = 'room'
  state.code = code
  if (codeFromHash() !== code) history.replaceState(null, '', `#r=${code}`)
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
  if (inRoom) {
    $('#room-code').textContent = state.code
    const qr = qrcode(0, 'M')
    qr.addData(roomUrl(state.code))
    qr.make()
    $('#room-qr').innerHTML = qr.createSvgTag({cellSize: 5, margin: 2, scalable: true})
  }
}

function openRoomDialog() {
  renderRoomDialog()
  $('#room-input').value = ''
  showDialog($('#dlg-room'))
}

$('#btn-room').addEventListener('click', openRoomDialog)
$('#room-create').addEventListener('click', async () => {
  await enterRoom(newRoomCode())
  renderRoomDialog()
})
function joinTyped() {
  const code = normalizeCode($('#room-input').value)
  if (code.length < 4) {
    $('#room-input').focus()
    return
  }
  $('#dlg-room').close()
  enterRoom(code)
}
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
  renderMe()
  updateMode()
  for (const [id, p] of state.peers) {
    radar.upsert(id, p.info)
    if (p.status.kind !== 'idle') setPeerStatus(id, p.status.kind, p.status.fraction)
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
  state.session?.announce({name: next})
})

// ---------- start ----------

renderThemeIcon()
applyLanguage()

const startCode = codeFromHash()
if (startCode) enterRoom(startCode)
else enterLocal()
