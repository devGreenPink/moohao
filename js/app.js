import {t, lang, setLang, applyStatic} from './i18n.js'
import {createSession, detectNetworkRoom, codeRoom, pairRoom, randomId} from './net.js'
import {newWordCode, parseRoomCode, displayCode, codeWords, isWordCode} from './words.js'
import {notifyState, toggleNotify, notify, closeNotification, onNotificationAction, buzz, bumpBadge, clearBadge} from './notify.js'
import {scannerSupported, runScanner} from './ui/scanner.js'
import {memorySink, diskSink, diskSupported, streamSink, streamSupported, MEMORY_SINK_LIMIT, MEMORY_FALLBACK_LIMIT} from './sinks.js'
import {loadPairs, addPair, removePair, touchPair} from './pairing.js'
import {AVATARS, COLOR_COUNT, defaultAvatar, defaultColor, cleanAvatar, cleanColor, withLook, randomName, isOldGeneratedName} from './identity.js'
import {avatarSvg} from './ui/avatars.js'
import {knownDevice, noteSeen, noteTransfer, setNickname, familiarity, displayName} from './known.js'
import {qrcode} from '../vendor/vendor.js'
import {ICONS} from './ui/mascot.js'
import {createRadar} from './ui/radar.js'
import {createPanel} from './ui/panel.js'
import {createScanStatus} from './ui/status.js'
import {createTransferList, fmtSize} from './ui/transfers.js'
import {createSky} from './ui/sky.js'
import {effectsOn, powerSetting, setPowerSetting, isLite, liteReason, onPowerChange} from './ui/effects.js'

const $ = sel => document.querySelector(sel)

/** After this long with nobody found, switch from "searching" to "not found" + help. */
const SEARCH_GRACE_MS = 15_000

/** Finished transfers stay in the floating tray this long, and in the side panel longer. */
const TRAY_LINGER_MS = 8_000
const PANEL_LINGER_MS = 60_000

// ---------- small helpers ----------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key)
    localStorage.setItem(key, value)
  } catch {}
  return null
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

const relativeFormats = {}
function relativeTime(ts) {
  const diff = (ts - Date.now()) / 1000
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  const fmt = (relativeFormats[lang] ??= new Intl.RelativeTimeFormat(lang, {numeric: 'auto'}))
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return fmt.format(Math.round(diff / secs), unit)
  }
  return fmt.format(0, 'minute')
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

// New devices (and ones still using an old auto-generated animal name) get a random space
// name and matching mascot straight away — no setup step; a hint shows how to change it.
const storedName = store('nearby.name')
const freshIdentity = !storedName || isOldGeneratedName(storedName)
const me = {
  name: freshIdentity ? randomName() : storedName,
  deviceId: store('nearby.deviceId') || randomId(12),
  ...detectDevice(),
}
me.avatar = (!freshIdentity && cleanAvatar(store('nearby.avatar'))) || defaultAvatar(me.name, me.deviceId)
store('nearby.avatar', me.avatar)
const savedColor = store('nearby.color')
me.color = (savedColor !== null ? cleanColor(Number(savedColor)) : null) ?? defaultColor(me.deviceId, me.name)
store('nearby.name', me.name)
store('nearby.deviceId', me.deviceId)

// ---------- state ----------

const state = {
  main: null, // session for the network / room-code room
  pairSessions: new Map(), // pairId -> session (null while starting)
  mode: 'local', // 'local' | 'room' | 'offline' (network lookup failed)
  code: null,
  netRoom: undefined,
  // peerId -> {raw, info, links: Map(key -> session), status, clearTimer, code, codePromise, offline}
  peers: new Map(),
  pending: null, // {kind: 'files', files, shared?} | {kind: 'text', text, shared?}
  targetPeer: null,
  incoming: new Map(), // tid -> {sink, peerId}
  withdrawn: new Set(), // offers the sender cancelled before we answered
  // tid -> transfer record (see addTransfer); kept a while after finishing for the cards
  xfers: new Map(),
  sendingTo: new Set(), // peers we're preparing an offer for (thumbnails etc.)
  offerPeer: null,
  offerTid: null,
  offerTag: null,
  lastScanKind: 'searching',
  lastNetCheck: 0,
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

/** paired → closest ring; seen before → middle; new → outer. */
function tierOf(id) {
  if (pairFor(id)) return 'paired'
  return familiarity(state.peers.get(id)?.info.deviceId)
}

/** Peer info as shown: avatar/colour filled in, nickname applied. */
function decorate(raw) {
  const info = withLook(raw)
  info.displayName = displayName(info)
  return info
}

function nameOf(id) {
  return state.peers.get(id)?.info.displayName || '?'
}

// ---------- UI components ----------

function describePeer(info, status, tier) {
  const sys = [info.os, info.browser].filter(Boolean).join(' ')
  const parts = [info.displayName, t(info.device) + (sys ? ` (${sys})` : ''), t(tier === 'paired' ? 'pairedBadge' : tier === 'known' ? 'tagKnown' : 'tagNew')]
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
  onPair: id => pairWith(id),
  onUnpair: id => unpairPeer(id),
  onNickname: id => editNickname(id),
  onClose: () => {
    const id = radar.selected
    selectPeer(null)
    if (id) radar.focus(id)
  },
  onUseRoom: () => openRoomDialog(),
})

const transferHandlers = {
  onCancel: (peerId, tid) => state.xfers.get(tid)?.session.cancel(tid),
  onOpen: tid => {
    const x = state.xfers.get(tid)
    if (x?.results) showReceived(x.peerId, x.results, {quiet: true})
  },
}
const trayList = createTransferList($('#tray'), {compact: true, ...transferHandlers, onSelect: id => state.peers.has(id) && selectPeer(id)})
const panelList = createTransferList(panel.transferContainer, transferHandlers)

const scan = createScanStatus(document.body)

const sky = createSky({canvas: $('#sky-canvas'), twinkleLayer: $('#sky-twinkles'), shootLayer: $('#sky-shooting')})

// ---------- view refresh ----------

function currentError() {
  if (!state.online) return t('offline')
  if (state.mode === 'offline') return t('ipFailed')
  if (state.joinError) return t('joinError', {msg: state.joinError})
  return null
}

/** Recompute the scan bar, hero and side panel from state. */
function refresh() {
  const count = onlineCount()
  const error = count ? null : currentError()
  let kind
  if (error) kind = 'error'
  else if (count) kind = 'found'
  else kind = Date.now() - state.searchStart < SEARCH_GRACE_MS ? 'searching' : 'none'

  scan.set({kind, count, mode: state.mode, code: state.code && displayCode(state.code, lang), message: error})
  renderPanel(kind, error)
}

function historyLine(deviceId) {
  const rec = knownDevice(deviceId)
  if (!rec) return ''
  const seen = rec.prevSeen ? t('lastSeen', {when: relativeTime(rec.prevSeen)}) : t('firstTime')
  const n = (rec.sent || 0) + (rec.received || 0)
  return n ? `${seen} · ${t('transfersCount', {n})}` : seen
}

/**
 * Just the side panel. Transfer progress calls this (several times a second) instead of
 * refresh(), so the scan bar and other UI aren't rebuilt on every tick.
 */
function renderPanel(kind = state.lastScanKind, error = null) {
  state.lastScanKind = kind
  const sel = radar.selected
  if (sel && state.peers.has(sel)) {
    const p = state.peers.get(sel)
    if (p.code === undefined) loadCode(sel)
    panel.render({
      kind: 'peer', id: sel, info: p.info, status: p.status, code: p.code,
      tier: tierOf(sel), history: historyLine(p.info.deviceId), offline: p.offline,
      hasTransfers: panelTransfers(sel).length > 0,
    })
  } else if (kind === 'error') {
    panel.render({kind: 'error', message: error ?? currentError()})
  } else if (kind === 'found') {
    panel.render({kind: 'pick'})
  } else {
    panel.render({kind})
  }
}

function refreshPairListIfOpen() {
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
  $('#me-avatar').innerHTML = avatarSvg(me.avatar)
  $('#me-card').dataset.color = String(me.color)
  $('#self').dataset.color = String(me.color)
  $('#self-avatar').innerHTML = avatarSvg(me.avatar)
  $('#self-hint').dataset.color = String(me.color)
  $('#self').setAttribute('aria-label', `${t('you')}: ${me.name} — ${t('profileTitle')}`)
}

// ---------- peers ----------

function upsertNode(id) {
  const p = state.peers.get(id)
  if (p) radar.upsert(id, p.info, {tier: tierOf(id), offline: p.offline})
}

function linkPeer(id, key, session, raw) {
  let p = state.peers.get(id)
  if (!p) {
    p = {raw, info: null, links: new Map(), status: {kind: 'idle'}, clearTimer: 0, code: undefined, codePromise: null, offline: false}
    state.peers.set(id, p)
  }
  p.raw = raw
  p.info = decorate(raw)
  if (p.offline) {
    // back after a drop: new connection, new safety code
    p.code = undefined
    p.codePromise = null
  }
  p.offline = false
  p.links.set(key, session)
  if (key === 'main') state.joinError = null
  if (key.startsWith('pair:')) touchPair(key.slice(5), p.info)
  upsertNode(id) // tier is computed before noteSeen so a new device stays "new" this visit
  noteSeen(p.info)
  refresh()
  refreshPairListIfOpen()
}

function unlinkPeer(id, key) {
  const p = state.peers.get(id)
  if (!p) return
  p.links.delete(key)
  // the connection used for the safety code may have changed
  p.code = undefined
  p.codePromise = null
  if (p.links.size) {
    refresh()
    refreshPairListIfOpen()
    return
  }
  if (activeWith(id).length) {
    // A transfer is waiting for this device to reconnect: keep it on the radar, dimmed.
    p.offline = true
    upsertNode(id)
    refresh()
    return
  }
  removePeerNow(id)
}

function removePeerNow(id) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  state.peers.delete(id)
  radar.remove(id)
  if (state.offerPeer === id && $('#dlg-offer').open) $('#dlg-offer').close('no')
  if (!onlineCount()) restartSearchClock()
  refresh()
  refreshPairListIfOpen()
}

function onlineCount() {
  let n = 0
  for (const p of state.peers.values()) if (!p.offline) n++
  return n
}

function refreshPeers() {
  for (const [id, p] of state.peers) {
    p.info = decorate(p.raw)
    upsertNode(id)
  }
  refresh()
  refreshPairListIfOpen()
}

function editNickname(id) {
  const p = state.peers.get(id)
  if (!p?.info.deviceId) return
  const current = knownDevice(p.info.deviceId)?.nickname || ''
  const next = prompt(t('nicknamePrompt'), current || p.info.name)
  if (next === null) return
  setNickname(p.info.deviceId, next === p.info.name ? '' : next)
  refreshPeers()
}

// ---------- transfers (records, cards, wake lock) ----------

const ACTIVE = new Set(['waiting', 'active', 'reconnecting'])
const isActive = x => ACTIVE.has(x.status)

/** Active transfers with a peer, as [tid, record] pairs. */
function activeWith(id) {
  return [...state.xfers.entries()].filter(([, x]) => x.peerId === id && isActive(x))
}

function activeCount() {
  let n = 0
  for (const x of state.xfers.values()) if (isActive(x)) n++
  return n
}

function panelTransfers(id) {
  const now = Date.now()
  return [...state.xfers.values()].filter(x => x.peerId === id && (isActive(x) || now - x.finishedAt < PANEL_LINGER_MS))
}

/**
 * record: {tid, peerId, session, dir, files, total, done, status, speed, eta, start, base,
 *          results?, finishedAt?}
 */
function addTransfer(tid, {peerId, session, dir, files}) {
  const firstActive = activeCount() === 0
  state.xfers.set(tid, {
    tid, peerId, session, dir,
    files: files.map(f => ({name: f.name, size: f.size, type: f.type, thumb: f.thumb || null})),
    total: files.reduce((s, f) => s + f.size, 0),
    done: 0, status: 'waiting', speed: 0, eta: 0, start: 0, base: 0, finishedAt: 0,
  })
  if (me.device !== 'desktop' && firstActive) toast(t('keepOpen'), 5000)
  updateWakeLock()
  scheduleTransferRender()
}

/** Progress for a transfer: bytes done of total. */
function transferProgress(tid, done) {
  const x = state.xfers.get(tid)
  if (!x) return
  const now = performance.now()
  if (x.status !== 'active') {
    // (re)started: measure speed from here, not across a wait or a reconnect gap
    x.start = now
    x.base = done
    x.status = 'active'
    if (!x.launched) {
      x.launched = true
      radar.launch(x.peerId, x.dir) // a comet flies off (or in) as the bytes start moving
    }
  }
  x.done = done
  const secs = (now - x.start) / 1000
  x.speed = secs > 0.4 ? (done - x.base) / secs : 0
  x.eta = x.speed > 0 ? (x.total - done) / x.speed : 0
  setPeerStatus(x.peerId, x.dir === 'out' ? 'sending' : 'receiving', {fraction: x.total ? done / x.total : 1, speed: x.speed})
  scheduleTransferRender()
}

function transferState(tid, status) {
  const x = state.xfers.get(tid)
  if (!x) return
  x.status = status
  if (!ACTIVE.has(status)) {
    x.finishedAt = Date.now()
    if (status === 'done') {
      x.done = x.total
      noteTransfer(state.peers.get(x.peerId)?.info.deviceId, x.dir)
      // stars burst around whoever just got the files
      if (x.dir === 'out') radar.celebrate(x.peerId)
      else radar.celebrate(null, me.color)
    }
    updateWakeLock()
    // A device kept on the radar only for this transfer can go now.
    const p = state.peers.get(x.peerId)
    if (p?.offline && !activeWith(x.peerId).length) setTimeout(() => {
      if (state.peers.get(x.peerId)?.offline && !activeWith(x.peerId).length) removePeerNow(x.peerId)
    }, 4000)
    setTimeout(scheduleTransferRender, TRAY_LINGER_MS + 50)
    setTimeout(() => {
      state.xfers.delete(tid)
      scheduleTransferRender()
    }, PANEL_LINGER_MS + 50)
  }
  scheduleTransferRender()
}

function viewModel(x) {
  const p = state.peers.get(x.peerId)
  const info = p?.info || {displayName: '?', avatar: 'planet', color: 0}
  return {
    tid: x.tid, peerId: x.peerId, dir: x.dir, status: x.status, files: x.files,
    done: x.done, total: x.total, speed: x.speed, eta: x.eta,
    peer: {displayName: info.displayName, avatar: info.avatar, color: info.color},
    canOpen: x.status === 'done' && !!x.results,
  }
}

/** Radar and panel side by side (matches the 1080px breakpoint in style.css). */
const sideBySide = matchMedia('(min-width: 1081px)')
sideBySide.addEventListener('change', () => scheduleTransferRender())

// Progress can arrive from several transfers at once; draw at most once per frame.
let transferFrame = 0
function scheduleTransferRender() {
  if (transferFrame) return
  transferFrame = requestAnimationFrame(() => {
    transferFrame = 0
    renderTransfers()
  })
}

function renderTransfers() {
  const now = Date.now()
  const list = [...state.xfers.values()].sort((a, b) => (isActive(b) - isActive(a)) || b.finishedAt - a.finishedAt)
  const sel = radar.selected
  // On wide screens the side panel is always in view, so the tray skips what it already shows.
  const panelShows = sel && sideBySide.matches
  trayList.render(list
    .filter(x => (isActive(x) || now - x.finishedAt < TRAY_LINGER_MS) && !(panelShows && x.peerId === sel))
    .map(viewModel))
  const inPanel = sel ? list.filter(x => x.peerId === sel && (isActive(x) || now - x.finishedAt < PANEL_LINGER_MS)) : []
  panelList.render(inPanel.map(viewModel))
  // particle beams on the radar for transfers that are moving bytes
  const beams = new Map()
  for (const x of list) if (x.status === 'active') beams.set(x.peerId, x.dir)
  for (const id of state.peers.keys()) radar.setBeam(id, beams.get(id) || null)
  // The panel itself only needs redrawing when its Transfers section appears or goes away;
  // progress lives in the cards, which update themselves.
  const key = `${sel}|${inPanel.length > 0}`
  if (state.panelXferKey !== key) {
    state.panelXferKey = key
    renderPanel()
  }
}

// Keep the screen on while files are moving: phones suspend or throttle pages when the
// screen turns off, which stalls or drops the connection.
let wakeLock = null
async function updateWakeLock() {
  const want = activeCount() > 0 && document.visibilityState === 'visible'
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => { wakeLock = null })
      if (!activeCount()) updateWakeLock()
    } catch {
      wakeLock = null
    }
  } else if (!activeCount() && wakeLock) {
    const lock = wakeLock
    wakeLock = null
    lock.release().catch(() => {})
  }
}
// The browser drops the wake lock whenever the page is hidden; take it back on return.
document.addEventListener('visibilitychange', updateWakeLock)

// Closing the tab mid-transfer would lose it; ask first.
window.addEventListener('beforeunload', e => {
  if (!activeCount()) return
  e.preventDefault()
  e.returnValue = ''
})

function selectPeer(id) {
  radar.select(id)
  refresh()
  renderTransfers()
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

/** Compute (once) and cache the safety code for a peer. */
function loadCode(id) {
  const p = state.peers.get(id)
  if (!p) return Promise.resolve(null)
  if (p.code !== undefined) return Promise.resolve(p.code)
  p.codePromise ??= (async () => {
    const code = (await sessionFor(id)?.verificationCode(id).catch(() => null)) ?? null
    if (state.peers.get(id) === p && p.codePromise) {
      p.code = code
      if (radar.selected === id) renderPanel()
    }
    return code
  })()
  return p.codePromise
}

const TERMINAL = new Set(['done', 'declined', 'failed', 'cancelled'])

/**
 * The status shown on a device's radar node (ring, badge, short text).
 * kind: idle | waiting | sending | receiving | reconnecting | done | declined | failed | cancelled
 */
function setPeerStatus(id, kind, {fraction = 0, speed = 0} = {}) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  let text = ''
  if (kind === 'reconnecting') {
    fraction = p.status.fraction || 0 // keep the progress ring where it was
    text = t('reconnecting')
  } else if (kind === 'waiting') text = t('waiting')
  else if (kind === 'sending' || kind === 'receiving') {
    const pct = Math.floor(fraction * 100)
    text = speed > 0 ? `${pct}% · ${fmtSize(speed)}/s` : `${pct}%`
  } else if (kind !== 'idle') text = t(kind)

  const changed = p.status.kind !== kind
  p.status = {kind, fraction, text}
  radar.setStatus(id, p.status)
  if (changed && radar.selected === id) renderPanel()

  if (TERMINAL.has(kind)) {
    announce(`${p.info.displayName}: ${text}`)
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
  const session = sessionFor(id)
  if (!p || !files.length || !session) return
  if (state.sendingTo.has(id) || activeWith(id).some(([, x]) => x.dir === 'out')) return toast(t('busy'))
  state.sendingTo.add(id)
  let myTid = null
  try {
    const thumbs = await Promise.all(files.map((f, i) => (i < 8 ? makeThumb(f) : null)))
    await session.sendFiles(id, files, thumbs,
      (status, sent) => {
        if (!myTid) return
        if (status === 'sending') return transferProgress(myTid, sent)
        if (status === 'waiting') return
        if (status === 'reconnecting') {
          transferState(myTid, 'reconnecting')
          return setPeerStatus(id, 'reconnecting')
        }
        transferState(myTid, status)
        setPeerStatus(id, status)
        const name = nameOf(id)
        if (status === 'done') alertUser({title: t('nSent', {name}), body: fileNames(files), tag: `sent-${id}`})
        else if (status === 'declined') alertUser({title: t('nDeclined', {name}), body: fileNames(files), tag: `sent-${id}`})
        else if (status === 'failed') alertUser({title: t('nFailed', {name}), body: fileNames(files), tag: `sent-${id}`})
      },
      tid => {
        myTid = tid
        addTransfer(tid, {peerId: id, session, dir: 'out', files: files.map((f, i) => ({name: f.name, size: f.size, type: f.type, thumb: thumbs[i]}))})
        setPeerStatus(id, 'waiting')
      })
  } finally {
    state.sendingTo.delete(id)
    // anything that ended without a final status (e.g. the room was left) is a failure
    const x = myTid && state.xfers.get(myTid)
    if (x && isActive(x)) transferState(myTid, 'failed')
  }
}

async function sendText(id, text) {
  const session = sessionFor(id)
  if (!state.peers.has(id) || !text.trim() || !session) return
  try {
    await session.sendText(id, text)
    toast(t('sentTo', {name: nameOf(id)}))
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
    if (signal?.aborted || !peer || state.withdrawn.has(data.tid)) return resolve(null)
    const name = peer.info.displayName
    const total = data.files.reduce((s, f) => s + f.size, 0)
    $('#offer-title').textContent = t('incomingTitle', {name})
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
    state.offerTid = data.tid
    chime()
    flagTitle()
    alertUser({
      title: t('nOffer', {name: peer.info.displayName}),
      body: `${t('filesCount', {n: data.files.length, size: fmtSize(total)})}\n${fileNames(data.files)}`,
      tag,
      actions: [{action: 'accept', title: t('accept')}, {action: 'decline', title: t('decline')}],
    })
    const answer = await showDialog(dlg)
    state.offerPeer = null
    state.offerTag = null
    state.offerTid = null
    closeNotification(tag)
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)

    const gone = () => signal?.aborted || !state.peers.has(peerId) || state.withdrawn.has(data.tid)
    if (answer !== 'yes' || gone()) return resolve(null)
    const sink = await chooseSink(data.files, total)
    if (!sink) return resolve(null)
    if (gone()) {
      sink.abort()
      return resolve(null)
    }
    state.incoming.set(data.tid, {sink, peerId})
    addTransfer(data.tid, {peerId, session, dir: 'in', files: data.files.map(f => ({...f, thumb: safeThumb(f.thumb)}))})
    transferProgress(data.tid, 0)
    resolve(sink)
  }))
}

/** The sender's connection dropped mid-transfer; it may come back and resume. */
function onIncomingPaused(peerId, tid) {
  transferState(tid, 'reconnecting')
  setPeerStatus(peerId, 'reconnecting')
}

function onIncomingProgress(peerId, tid, received) {
  transferProgress(tid, received)
}

/** The sender withdrew an offer we haven't answered yet: close or skip its dialog. */
function onOfferCancelled(peerId, tid) {
  if (state.withdrawn.size > 200) state.withdrawn.clear()
  state.withdrawn.add(tid)
  if (state.offerTid === tid && $('#dlg-offer').open) $('#dlg-offer').close('no')
  closeNotification(`offer-${tid}`)
}

function onIncomingDone(peerId, tid) {
  const inc = state.incoming.get(tid)
  state.incoming.delete(tid)
  const x = state.xfers.get(tid)
  if (x && inc?.sink.kind === 'memory') x.results = inc.sink.results
  transferState(tid, 'done')
  setPeerStatus(peerId, 'done', {fraction: 1})
  if (!inc) return
  const files = x?.files || []
  alertUser({title: t('nReceived', {n: files.length, name: nameOf(peerId)}), body: fileNames(files), tag: `recv-${tid}`})
  if (inc.sink.kind === 'memory') showReceived(peerId, inc.sink.results)
  else if (inc.sink.kind === 'disk') toast(t('savedToDisk', {n: files.length}), 4000)
  else toast(t('downloadSaved'), 4000)
}

function onIncomingFailed(peerId, tid, reason) {
  state.incoming.delete(tid)
  transferState(tid, reason === 'cancelled' ? 'cancelled' : 'failed')
  setPeerStatus(peerId, reason === 'cancelled' ? 'cancelled' : 'failed')
}

function showReceived(peerId, files, {quiet = false} = {}) {
  const name = nameOf(peerId)
  enqueue(async () => {
    const urls = files.map(f => URL.createObjectURL(f.blob))
    $('#received-title').textContent = t('receivedTitle', {name})
    $('#received-files').replaceChildren(...files.map((f, i) =>
      fileRow(f, {url: urls[i], thumb: /^image\//.test(f.type) ? urls[i] : null})))
    $('#received-all').hidden = files.length < 2
    if (!quiet) {
      chime()
      flagTitle()
    }
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
  const name = nameOf(peerId)
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
  if (!state.peers.has(id)) return
  composePeer = id
  $('#compose-title').textContent = t('sendTextTo', {name: nameOf(id)})
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

// ---------- mascot blinks ----------

// Every so often one visible mascot blinks: a short class toggle on one element, instead of
// a blink animation running on every avatar all the time.
setInterval(() => {
  if (document.hidden || !effectsOn()) return
  const avatars = document.querySelectorAll('.radar .space-avatar, #panel .space-avatar')
  if (!avatars.length) return
  const svg = avatars[Math.floor(Math.random() * avatars.length)]
  svg.classList.add('blink')
  setTimeout(() => svg.classList.remove('blink'), 180)
}, 1500)

// ---------- first-run hint ----------

/** A short "this is you" bubble under your own avatar instead of a setup dialog. */
function showSelfHint() {
  const hint = $('#self-hint')
  hint.hidden = false
  const hide = () => {
    hint.hidden = true
    document.removeEventListener('pointerdown', hide, true)
  }
  setTimeout(() => document.addEventListener('pointerdown', hide, true), 0)
  setTimeout(hide, 12_000)
}

// ---------- profile ----------

function applyTheme(theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  store('nearby.theme', theme === 'light' ? 'light' : 'night')
  sky.setTheme(theme === 'light' ? 'dawn' : 'night')
}

function openProfile() {
  const draft = {avatar: me.avatar, color: me.color, theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'night'}
  $('#profile-title').textContent = t('profileTitle')
  const nameInput = $('#profile-name')
  nameInput.value = me.name

  // Radio groups: only the chosen option is a tab stop (arrow keys move within the group).
  const mark = (b, on) => {
    b.setAttribute('aria-checked', String(on))
    b.tabIndex = on ? 0 : -1
  }
  const preview = () => {
    $('#profile-avatar').innerHTML = avatarSvg(draft.avatar)
    $('#profile-preview').dataset.color = String(draft.color)
    for (const b of $('#profile-avatars').children) mark(b, b.dataset.avatar === draft.avatar)
    for (const b of $('#profile-colors').children) mark(b, Number(b.dataset.color) === draft.color)
    for (const b of $('#profile-theme').children) mark(b, b.dataset.themeValue === draft.theme)
  }

  $('#profile-avatars').replaceChildren(...AVATARS.map(a => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.dataset.avatar = a
    b.innerHTML = avatarSvg(a)
    b.setAttribute('aria-label', a)
    b.addEventListener('click', () => { draft.avatar = a; preview() })
    return b
  }))
  $('#profile-colors').replaceChildren(...Array.from({length: COLOR_COUNT}, (_, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-label', `${t('pickColor')} ${i + 1}`)
    b.dataset.color = String(i)
    b.addEventListener('click', () => { draft.color = i; preview() })
    return b
  }))
  for (const b of $('#profile-theme').children) {
    b.onclick = () => {
      draft.theme = b.dataset.themeValue
      applyTheme(draft.theme) // preview live
      preview()
    }
  }
  // Power saving applies (and is saved) right away; it isn't part of the profile you share.
  const renderPower = () => {
    for (const b of $('#profile-power').children) mark(b, b.dataset.power === powerSetting())
    const why = liteReason()
    $('#profile-power-note').textContent = isLite()
      ? t('powerNowLite') + (why ? ' (' + t(why === 'battery' ? 'powerBattery' : 'powerDevice') + ')' : '')
      : t('powerNowFull')
  }
  for (const b of $('#profile-power').children) {
    b.onclick = () => {
      setPowerSetting(b.dataset.power)
      renderPower()
    }
  }
  renderPower()
  preview()

  const themeBefore = draft.theme
  showDialog($('#dlg-profile')).then(v => {
    if (v !== 'save') {
      applyTheme(themeBefore)
      return
    }
    const name = nameInput.value.trim().slice(0, 40) || me.name
    Object.assign(me, {name, avatar: draft.avatar, color: draft.color})
    store('nearby.name', me.name)
    store('nearby.avatar', me.avatar)
    store('nearby.color', String(me.color))
    renderMe()
    for (const s of allSessions()) s.announce({name: me.name, avatar: me.avatar, color: me.color})
  })
  setTimeout(() => nameInput.focus(), 50)
}

$('#self').addEventListener('click', () => openProfile())
$('#me-card').addEventListener('click', () => openProfile())

// Arrow keys pick the previous/next option in the profile's radio groups.
for (const group of ['#profile-avatars', '#profile-colors', '#profile-theme', '#profile-power']) {
  $(group).addEventListener('keydown', e => {
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key]
    if (!step) return
    const items = [...e.currentTarget.children]
    const i = items.indexOf(document.activeElement)
    if (i < 0) return
    e.preventDefault()
    const next = items[(i + step + items.length) % items.length]
    next.click()
    next.focus()
  })
}

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
  // Tell the other device we got its "yes" — it saves the pairing only after this.
  await session.confirmPair(id, secret)
  await savePairing({secret, name: res.name || p.info.name, deviceId: res.deviceId || p.info.deviceId})
}

async function savePairing(request, {vibrate = true} = {}) {
  const record = await addPair(request)
  await ensurePairSession(record)
  toast(t('pairDone', {name: record.name}))
  alertUser({title: t('nPairDone', {name: record.name}), tag: `pair-${record.id}`, vibrate})
  refreshPeers()
}

/** The requester confirmed it received our acceptance; now both sides store the pairing. */
function onPairConfirmed(peerId, request) {
  const peer = state.peers.get(peerId)
  savePairing({secret: request.secret, name: request.name || peer?.info.name, deviceId: request.deviceId || peer?.info.deviceId}, {vibrate: false})
}

/** Ask the user; the pairing itself is saved later in onPairConfirmed. */
function askPair(peerId, request, signal, session) {
  return new Promise(resolve => enqueue(async () => {
    const peer = state.peers.get(peerId)
    if (signal?.aborted || !peer) return resolve(false)
    const code = await session.verificationCode(peerId).catch(() => null)
    const name = request.name || peer.info.displayName
    $('#pair-title').textContent = t('pairTitle', {name})
    $('#pair-code').textContent = code || '—'
    const dlg = $('#dlg-pair')
    const abort = () => dlg.open && dlg.close('no')
    signal?.addEventListener('abort', abort, {once: true})
    // Answer well before the requester's 2-minute timeout so a late "yes" can't be lost.
    const timer = setTimeout(abort, 100 * 1000)
    chime()
    flagTitle()
    const tag = `pairreq-${peerId}`
    alertUser({title: t('nPairRequest', {name}), body: code ? t('nPairCode', {code}) : '', tag})
    const answer = await showDialog(dlg)
    clearTimeout(timer)
    closeNotification(tag)
    signal?.removeEventListener('abort', abort)
    resolve(answer === 'yes' && !signal?.aborted)
  }))
}

function unpairRecord(record, notifyPeerId) {
  if (notifyPeerId) sessionFor(notifyPeerId)?.tellUnpair(notifyPeerId, record.id)
  removePair(record.id)
  // Leave the room a moment later so the "unpair" message can go out on it.
  setTimeout(() => stopPairSession(record.id), 800)
  toast(t('unpaired', {name: record.name}))
  refreshPeers()
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
    const online = [...state.peers.values()].some(p => !p.offline && (p.links.has(`pair:${rec.id}`) || (rec.deviceId && p.info.deviceId === rec.deviceId)))
    const known = knownDevice(rec.deviceId)
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.className = 'pair-name'
    li.dataset.color = String(cleanColor(known?.color) ?? defaultColor(rec.deviceId, rec.name))
    name.innerHTML = avatarSvg(cleanAvatar(known?.avatar) || defaultAvatar(rec.name, rec.deviceId))
    name.append(` ${known?.nickname || rec.name}`)
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
    onIncomingProgress,
    onIncomingPaused,
    onOfferCancelled,
    onIncomingDone,
    onIncomingFailed,
    onText: showMessage,
    onPairRequest: (id, request, signal) => askPair(id, request, signal, self()),
    onPairConfirmed,
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
  if (!state.netRoom) {
    state.lastNetCheck = Date.now()
    state.netRoom = await detectNetworkRoom()
  }
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

/**
 * The network can change under us (Wi‑Fi switched, laptop carried to another place).
 * Look up the public address again and move to the new network's room if it changed.
 */
async function recheckNetwork(force = false) {
  if (state.mode === 'room' || state.checkingNet) return
  if (!force && Date.now() - state.lastNetCheck < 15_000) return
  state.checkingNet = true
  state.lastNetCheck = Date.now()
  try {
    const next = await detectNetworkRoom()
    if (!next || state.mode === 'room') return // keep the current room on a transient failure
    if (state.mode === 'local' && state.main && next.roomId === state.netRoom?.roomId) return
    state.netRoom = next
    state.mode = 'local'
    updateMode()
    await switchSession(next)
  } finally {
    state.checkingNet = false
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recheckNetwork()
})
navigator.connection?.addEventListener?.('change', () => recheckNetwork(true))
setInterval(() => {
  if (!document.hidden) recheckNetwork()
}, 60_000)

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
  // Coming back online often means a different network; also retries a failed lookup.
  if (state.mode === 'offline') enterLocal()
  else {
    refresh()
    recheckNetwork(true)
  }
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
  const online = [...state.peers.entries()].filter(([, p]) => !p.offline)
  const target = radar.selected || (online.length === 1 ? online[0][0] : null)
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

// ---------- language ----------

function applyLanguage() {
  applyStatic()
  $('#radar-nodes').setAttribute('aria-label', t('radarLabel'))
  renderNotifyButton()
  if ($('#dlg-room').open) renderRoomDialog()
  renderMe()
  updateMode()
  for (const [id, p] of state.peers) {
    upsertNode(id)
    if (p.status.kind !== 'idle') setPeerStatus(id, p.status.kind, {fraction: p.status.fraction})
  }
  renderTransfers()
}

$('#btn-lang').addEventListener('click', () => {
  setLang(lang === 'th' ? 'en' : 'th')
  applyLanguage()
})

// ---------- start ----------

if (document.documentElement.dataset.theme === 'light') sky.setTheme('dawn')
applyLanguage()
takeSharedItems()
for (const record of loadPairs()) ensurePairSession(record)

const startCode = codeFromHash()
if (startCode) enterRoom(startCode)
else enterLocal()

if (freshIdentity) showSelfHint()
