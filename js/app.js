import {t, lang, setLang, applyStatic} from './i18n.js'
import {createSession, detectNetworkRoom, codeRoom, pairRoom, randomId, RESUME_WAIT_MS} from './net.js'
import {parseRoomCode, displayCode, codeWords, isWordCode, isPictureCode, pictureIds, pictureCode, newPictureCode, PICTURES, PICTURE_IDS, PICTURE_LENGTH} from './words.js'
import {notifyState, toggleNotify, notify, closeNotification, onNotificationAction, buzz, bumpBadge, clearBadge} from './notify.js'
import {scannerSupported, runScanner} from './ui/scanner.js'
import {memorySink, diskSink, diskSupported, streamSink, streamSupported, cleanFileName, MEMORY_SINK_LIMIT, MEMORY_FALLBACK_LIMIT} from './sinks.js'
import {loadPairs, addPair, removePair, touchPair} from './pairing.js'
import {AVATARS, COLOR_COUNT, defaultAvatar, defaultColor, cleanAvatar, cleanColor, withLook, randomName, isOldGeneratedName} from './identity.js'
import {avatarSvg} from './ui/avatars.js'
import {knownDevice, noteSeen, noteTransfer, setNickname, familiarity, displayName, markPairAsked} from './known.js'
import {qrcode} from '../vendor/vendor.js'
import {ICONS} from './ui/mascot.js'
import {createRadar} from './ui/radar.js'
import {createPanel} from './ui/panel.js'
import {createScanStatus} from './ui/status.js'
import {createTransferList, fmtSize, fmtTime, fileExt, isRisky} from './ui/transfers.js'
import {createInbox} from './ui/inbox.js'
import {createChat} from './ui/chat.js'
import {createSky} from './ui/sky.js'
import {effectsOn, powerSetting, setPowerSetting, isLite, liteReason, onPowerChange} from './ui/effects.js'

const $ = sel => document.querySelector(sel)

/** After this long with nobody found, switch from "searching" to "not found" + help. */
const SEARCH_GRACE_MS = 15_000

/** Finished transfers stay in the floating tray this long, and in the side panel longer. */
const TRAY_LINGER_MS = 8_000
const PANEL_LINGER_MS = 60_000
/** Failed / cancelled / declined cards stay until removed (or this long), so they can be retried. */
const PROBLEM_LINGER_MS = 15 * 60_000
/**
 * Received files kept in this page add up; past this total, new files go to disk / Downloads
 * instead, so a phone doesn't run out of memory and close the tab (losing everything unsaved).
 */
const INBOX_BUDGET = 512 * 1024 ** 2

// ---------- small helpers ----------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key)
    localStorage.setItem(key, value)
  } catch {}
  return null
}


function toast(text, ms = 2600) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = text
  $('#toasts').append(el)
  setTimeout(() => el.remove(), ms)
}

/** A toast with one button (e.g. "View"). Returns the element so it can be updated. */
function toastAction(text, label, onAction, ms = 5000) {
  const el = document.createElement('div')
  el.className = 'toast with-action'
  const span = document.createElement('span')
  span.textContent = text
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'link-btn'
  btn.textContent = label
  btn.addEventListener('click', () => {
    el.remove()
    onAction()
  })
  el.append(span, btn)
  $('#toasts').append(el)
  setTimeout(() => el.remove(), ms)
  return el
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
  chats: new Map(), // device id -> {messages, unread}; see "messages" below
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

function describePeer(info, status, tier, unread = 0, typing = false) {
  const sys = [info.os, info.browser].filter(Boolean).join(' ')
  const parts = [info.displayName, t(info.device) + (sys ? ` (${sys})` : ''), t(tier === 'paired' ? 'pairedBadge' : tier === 'known' ? 'tagKnown' : 'tagNew')]
  if (status?.text) parts.push(status.text)
  if (typing) parts.push(t('typingShort'))
  if (unread) parts.push(t('unreadLabel', {n: unread}))
  return parts.join(', ')
}

const radar = createRadar($('#radar'), {
  onActivate: id => onNodeActivate(id),
  onDropFiles: (id, dataTransfer) => {
    hideDropOverlay()
    const files = filesFromDrop(dataTransfer)
    if (files.length) sendFiles(id, files)
  },
  describe: describePeer,
})

const panel = createPanel($('#panel'), {
  onSendFiles: id => pickFilesFor(id),
  onSendText: id => openChat(id),
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
  onCancel: (peerId, tid) => confirmCancel(tid),
  onOpen: () => inbox.open(),
  onRetry: tid => retryTransfer(tid),
  onDismiss: tid => dismissTransfers([tid]),
}
const trayList = createTransferList($('#tray-list'), {compact: true, ...transferHandlers, onSelect: id => state.peers.has(id) && selectPeer(id)})
const panelList = createTransferList(panel.transferContainer, transferHandlers)

const scan = createScanStatus(document.body, {
  onSelect: id => state.peers.has(id) && selectPeer(id),
  onUseRoom: () => openRoomDialog(),
  // in a room already: the room dialog shows the pictures, QR code and "Share link"
  onInvite: () => openRoomDialog(),
})

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

  const peers = []
  for (const [id, p] of state.peers) {
    if (!p.offline && p.info) peers.push({id, name: p.info.displayName, avatar: p.info.avatar, color: p.info.color, unread: unreadOf(id)})
  }
  scan.set({kind, count, mode: state.mode, code: state.code && displayCode(state.code, lang), message: error, peers})
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
    renderChat()
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
  $('#btn-room').removeAttribute('aria-label')
  if (state.mode === 'room') {
    dot.classList.add('room')
    if (isPictureCode(state.code)) {
      // "Room" + the 4 little mascots, the same pictures the other device taps
      const label = $('#mode-label')
      label.textContent = `${t('roomWord')} `
      const pics = document.createElement('span')
      pics.className = 'chip-pics'
      pics.innerHTML = pictureIds(state.code).map(id => `<i data-color="${PICTURES[id][2]}">${avatarSvg(id)}</i>`).join('')
      label.append(pics)
      $('#btn-room').setAttribute('aria-label', t('modeRoom', {code: displayCode(state.code, lang)}))
    } else $('#mode-label').textContent = t('modeRoom', {code: displayCode(state.code, lang)})
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
  if (!p) return
  radar.upsert(id, p.info, {tier: tierOf(id), offline: p.offline})
  radar.setUnread(id, unreadOf(id)) // a device that reconnects keeps its unread count
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
  clearTimeout(typingFrom.get(id))
  typingFrom.delete(id)
  if (typingTo === id) typingTo = null
  state.peers.delete(id)
  flood.delete(id)
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
function addTransfer(tid, {peerId, session, dir, files, sources = null, sinkKind = null}) {
  const firstActive = activeCount() === 0
  const info = state.peers.get(peerId)?.info
  state.xfers.set(tid, {
    tid, peerId, session, dir, sinkKind,
    // the original File objects, so a failed send can be retried (outgoing only)
    sources,
    // shown if the device has left the radar by the time the card is read
    peer: {displayName: info?.displayName || '?', avatar: info?.avatar || 'planet', color: info?.color ?? 0},
    files: files.map(f => ({name: f.name, size: f.size, type: f.type, thumb: f.thumb || null})),
    total: files.reduce((s, f) => s + f.size, 0),
    done: 0, status: 'waiting', speed: 0, eta: 0, start: 0, base: 0, finishedAt: 0, pausedAt: 0,
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
    x.pausedAt = 0
    updateTicker()
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
  if (status === 'reconnecting' && x.status !== 'reconnecting') x.pausedAt = Date.now()
  x.status = status
  updateTicker()
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
    // A finished card goes away by itself; a problem stays until the user deals with it.
    setTimeout(() => {
      if (state.xfers.get(tid) !== x) return
      state.xfers.delete(tid)
      scheduleTransferRender()
    }, (status === 'done' ? PANEL_LINGER_MS : PROBLEM_LINGER_MS) + 50)
  }
  scheduleTransferRender()
}

/** Seconds a dropped transfer will still wait for the other device (same limit net.js uses). */
function waitLeft(x) {
  return Math.max(0, (RESUME_WAIT_MS - (Date.now() - x.pausedAt)) / 1000)
}

// While something is reconnecting, redraw once a second so its countdown moves.
let tickTimer = 0
function updateTicker() {
  const need = [...state.xfers.values()].some(x => x.status === 'reconnecting')
  if (need && !tickTimer) tickTimer = setInterval(scheduleTransferRender, 1000)
  else if (!need && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = 0
  }
}

const PROBLEM = new Set(['failed', 'cancelled', 'declined'])

/** Remove finished cards from the lists. No data is touched (received files live in the inbox). */
function dismissTransfers(tids) {
  for (const tid of tids) {
    const x = state.xfers.get(tid)
    if (x && !isActive(x)) state.xfers.delete(tid)
  }
  scheduleTransferRender()
}

function finishedIn(list) {
  return list.filter(x => !isActive(x)).map(x => x.tid)
}

async function confirmCancel(tid) {
  const x = state.xfers.get(tid)
  if (!x || !isActive(x)) return
  // An offer nobody has answered yet can go without asking: nothing has moved.
  if (x.status !== 'waiting') {
    const name = nameOfTransfer(x)
    const ok = await confirmBox({
      title: t(x.dir === 'out' ? 'cancelQOut' : 'cancelQIn', {name}),
      body: t(x.dir === 'out' ? 'cancelBodyOut' : 'cancelBodyIn', {name}),
      ok: t(x.dir === 'out' ? 'cancelTransfer' : 'cancelReceive'),
      cancel: t('keepGoing'),
    })
    if (!ok) return
  }
  if (isActive(x)) x.session.cancel(tid)
}

function retryTransfer(tid) {
  const x = state.xfers.get(tid)
  if (!x?.sources?.length || !peerReachable(x.peerId)) return
  // One send per device at a time: keep this card until the current one is done.
  if (state.sendingTo.has(x.peerId) || activeWith(x.peerId).some(([, o]) => o.dir === 'out')) return toast(t('busy'))
  state.xfers.delete(tid)
  sendFiles(x.peerId, x.sources)
}

function nameOfTransfer(x) {
  return state.peers.get(x.peerId)?.info.displayName || x.peer.displayName
}

function peerReachable(id) {
  const p = state.peers.get(id)
  return !!p && !p.offline && !!sessionFor(id)
}

/** What happened / what happens next, in plain words, for the card. */
function transferNote(x) {
  const name = nameOfTransfer(x)
  const s = x.status
  const out = x.dir === 'out'
  if (s === 'reconnecting') return t(out ? 'xNoteReconnectOut' : 'xNoteReconnectIn', {name, t: fmtTime(waitLeft(x))})
  let note = ''
  if (s === 'failed') note = out ? t('xNoteFailedOut', {name}) : t(x.sinkKind === 'stream' ? 'xNoteFailedStream' : 'xNoteFailedIn')
  else if (s === 'cancelled') note = out ? t('xNoteCancelledOut', {name}) : t(x.sinkKind === 'stream' ? 'xNoteFailedStream' : 'xNoteCancelledIn')
  else if (s === 'declined') note = t(x.busy ? 'xNoteBusy' : 'xNoteDeclined', {name})
  else if (s === 'done' && !out) {
    // (nothing to say about in-page files once they've been deleted from the received list)
    if (x.sinkKind !== 'memory') note = t(x.sinkKind === 'disk' ? 'xNoteDoneDisk' : 'xNoteDoneStream')
    else if (inbox.has(x.tid)) note = t('xNoteDoneMem')
  }
  if (out && PROBLEM.has(s) && x.sources && !peerReachable(x.peerId)) note += ' ' + t('xNoteOffline', {name})
  return note
}

function viewModel(x) {
  const info = state.peers.get(x.peerId)?.info || x.peer
  const problem = PROBLEM.has(x.status)
  return {
    tid: x.tid, peerId: x.peerId, dir: x.dir, status: x.status, files: x.files,
    done: x.done, total: x.total, speed: x.speed, eta: x.eta,
    peer: {displayName: info.displayName, avatar: info.avatar, color: info.color},
    note: transferNote(x),
    actions: {
      open: x.status === 'done' && x.dir === 'in' && x.sinkKind === 'memory' && inbox.has(x.tid),
      retry: problem && x.dir === 'out' && !!x.sources?.length && peerReachable(x.peerId),
      dismiss: problem,
    },
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

/** Only touch the attribute when it changes: this runs every frame while files move. */
function setHidden(el, hidden) {
  if (el.hidden !== hidden) el.hidden = hidden
}

function renderTransfers() {
  const now = Date.now()
  const list = [...state.xfers.values()].sort((a, b) => (isActive(b) - isActive(a)) || b.finishedAt - a.finishedAt)
  const sel = radar.selected
  // On wide screens the side panel is always in view, so the tray skips what it already shows.
  const panelShows = sel && sideBySide.matches
  // Problems stay listed until removed; successful transfers fade out on their own.
  const visible = (x, linger) => isActive(x) || x.status !== 'done' || now - x.finishedAt < linger
  const inTray = list.filter(x => visible(x, TRAY_LINGER_MS) && !(panelShows && x.peerId === sel))
  trayList.render(inTray.map(viewModel))
  setHidden($('#tray'), !inTray.length && $('#suggest').hidden)
  state.trayFinished = finishedIn(inTray)
  setHidden($('#tray-head'), !state.trayFinished.length)
  const inPanel = sel ? list.filter(x => x.peerId === sel && visible(x, PANEL_LINGER_MS)) : []
  panelList.render(inPanel.map(viewModel))
  state.panelFinished = finishedIn(inPanel)
  setHidden($('#panel-xfers-clear'), !state.panelFinished.length)
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

$('#tray-clear').addEventListener('click', () => dismissTransfers(state.trayFinished || []))
$('#panel-xfers-clear').addEventListener('click', () => dismissTransfers(state.panelFinished || []))

// Closing the tab mid-transfer, or with received files not saved yet, would lose them; ask first.
window.addEventListener('beforeunload', e => {
  if (!activeCount() && !inbox.unsaved) return
  e.preventDefault()
  e.returnValue = ''
})

function selectPeer(id) {
  radar.select(id)
  if (id) markRead(id) // opening a device's panel shows its conversation
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
        if (status === 'busy') {
          // the other device is getting too many offers at once: shown as "not accepted",
          // with a note to try again shortly rather than "they didn't want it"
          const x = state.xfers.get(myTid)
          if (x) x.busy = true
          status = 'declined'
        }
        if (status === 'sending') return transferProgress(myTid, sent)
        if (status === 'waiting') return
        if (status === 'reconnecting') {
          transferState(myTid, 'reconnecting')
          return setPeerStatus(id, 'reconnecting')
        }
        transferState(myTid, status)
        setPeerStatus(id, status)
        const name = nameOf(id)
        if (status === 'done') suggestPairing(id)
        if (status === 'done') alertUser({title: t('nSent', {name}), body: fileNames(files), tag: `sent-${id}`})
        else if (status === 'declined') alertUser({title: t('nDeclined', {name}), body: fileNames(files), tag: `sent-${id}`})
        else if (status === 'failed') alertUser({title: t('nFailed', {name}), body: fileNames(files), tag: `sent-${id}`})
      },
      tid => {
        myTid = tid
        addTransfer(tid, {peerId: id, session, dir: 'out', sources: files, files: files.map((f, i) => ({name: f.name, size: f.size, type: f.type, thumb: thumbs[i]}))})
        setPeerStatus(id, 'waiting')
      })
  } finally {
    state.sendingTo.delete(id)
    // anything that ended without a final status (e.g. the room was left) is a failure
    const x = myTid && state.xfers.get(myTid)
    if (x && isActive(x)) transferState(myTid, 'failed')
  }
}

/** Send a message; it shows up in the conversation right away and is marked if it fails. */
async function sendText(id, text) {
  if (!text.trim()) return
  if (!state.peers.has(id)) return toast(t('failed'))
  const session = sessionFor(id)
  const m = {dir: 'out', text, at: Date.now(), pending: !!session}
  pushMessage(id, m)
  if (!session) {
    // the device just dropped off (still on the radar for a moment): keep the message,
    // marked "Not sent", rather than letting what was typed vanish
    m.failed = true
    renderChat()
    return toast(t('failed'))
  }
  renderChat()
  try {
    await session.sendText(id, text)
    // (sent from elsewhere, e.g. pasted text: say so, since the conversation isn't on screen)
    if (!chatVisible(id)) toast(t('sentTo', {name: nameOf(id)}))
  } catch {
    m.failed = true
    toast(t('failed'))
  }
  m.pending = false
  renderChat()
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

/**
 * Ask before something that can't be undone. Resolves true for "yes".
 * The safe choice comes first and has focus, so Enter / Esc never destroy anything.
 */
async function confirmBox({title, body = '', ok, cancel = t('cancel')}) {
  const dlg = $('#dlg-confirm')
  if (dlg.open) return false
  $('#confirm-title').textContent = title
  $('#confirm-body').textContent = body
  $('#confirm-body').hidden = !body
  $('#confirm-yes').textContent = ok
  $('#confirm-no').textContent = cancel
  const answer = showDialog(dlg)
  $('#confirm-no').focus()
  return (await answer) === 'yes'
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
  if (isRisky(file.name)) li.classList.add('risky')
  let visual
  if (thumb) {
    visual = document.createElement('img')
    visual.src = thumb
    visual.alt = ''
  } else {
    visual = document.createElement('span')
    visual.textContent = fileExt(file.name) || 'file'
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
/**
 * Where an incoming offer will go: 'memory' (kept in this page, can be previewed),
 * 'disk' (save picker), 'stream' (straight to Downloads) or 'too-big'.
 * Memory only while the page's received files stay under INBOX_BUDGET in total.
 */
function sinkPlan(count, total) {
  if (total <= MEMORY_SINK_LIMIT && inbox.bytes + total <= INBOX_BUDGET) return 'memory'
  if (diskSupported(count)) return 'disk'
  if (streamSupported()) return 'stream'
  return total <= MEMORY_FALLBACK_LIMIT ? 'memory' : 'too-big'
}

async function chooseSink(files, total) {
  const plan = sinkPlan(files.length, total)
  if (plan === 'memory') return memorySink(files)
  if (plan === 'disk') {
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

// ---------- flood protection ----------

/**
 * Anyone in the same room can send offers, messages and pair requests, and each one opens a
 * dialog. Per device: only a few waiting at once and a few per minute; a device that keeps
 * going is ignored for a couple of minutes (its offers are simply declined).
 */
const FLOOD_RULES = {
  offer: {pending: 1, perMinute: 6},
  pair: {pending: 1, perMinute: 2},
  text: {perMinute: 30}, // messages don't open dialogs (nothing waits), only a toast
}
const FLOOD_MUTE_MS = 2 * 60_000
const flood = new Map() // peerId -> {mutedUntil, told, offer|pair|text: {pending, times}}

/**
 * May this device open one more dialog of this kind right now? Returns a ticket (the time
 * it was let in) or 0. Accepted offers are taken off the per-minute count again (release
 * with forget), so someone sending batch after batch that gets accepted is never muted.
 */
function admit(peerId, kind) {
  const rule = FLOOD_RULES[kind]
  const now = Date.now()
  let f = flood.get(peerId)
  if (!f) flood.set(peerId, (f = {mutedUntil: 0, told: false}))
  if (now < f.mutedUntil) return 0
  if (f.mutedUntil) {
    f.mutedUntil = 0
    f.told = false
  }
  const k = (f[kind] ??= {pending: 0, times: []})
  k.times = k.times.filter(ts => now - ts < 60_000)
  if (k.times.length >= rule.perMinute) {
    f.mutedUntil = now + FLOOD_MUTE_MS
    if (!f.told) {
      f.told = true
      toast(t('floodMuted', {name: nameOf(peerId)}), 5000)
    }
    return 0
  }
  if (rule.pending && k.pending >= rule.pending) return 0
  k.times.push(now)
  if (rule.pending) k.pending++
  return now
}

function release(peerId, kind, ticket = 0, forget = false) {
  const k = flood.get(peerId)?.[kind]
  if (!k) return
  k.pending = Math.max(0, k.pending - 1)
  if (forget) {
    const i = k.times.indexOf(ticket)
    if (i >= 0) k.times.splice(i, 1)
  }
}

/**
 * Wrap a queued dialog task so its promise always settles: if the task throws, resolve with
 * `fallback` (otherwise the caller, and the flood slot it holds, would wait forever).
 */
function settleOnError(resolve, fallback, task) {
  return async () => {
    try {
      await task()
    } catch (err) {
      resolve(fallback)
      throw err
    }
  }
}

// ---------- incoming offers ----------

/** Returns a sink, null (declined) or 'busy' (too many offers from this device right now). */
async function askOffer(peerId, data, signal, session) {
  const ticket = admit(peerId, 'offer')
  if (!ticket) return 'busy'
  // Names are shown and saved as-is, so drop invisible direction marks first: they can make
  // "invoice[RLO]gpj.exe" look like "invoiceexe.jpg".
  for (const f of data.files) f.name = cleanFileName(f.name)
  let sink = null
  try {
    sink = await offerDialog(peerId, data, signal, session)
    return sink
  } finally {
    release(peerId, 'offer', ticket, !!sink)
  }
}

function offerDialog(peerId, data, signal, session) {
  return new Promise(resolve => enqueue(settleOnError(resolve, null, async () => {
    const peer = state.peers.get(peerId)
    if (signal?.aborted || !peer || state.withdrawn.has(data.tid)) return resolve(null)
    const name = peer.info.displayName
    const total = data.files.reduce((s, f) => s + f.size, 0)
    $('#offer-title').textContent = t('incomingTitle', {name})
    $('#offer-summary').textContent = t('filesCount', {n: data.files.length, size: fmtSize(total)})
    const rows = data.files.slice(0, 50).map(f => fileRow(f, {thumb: safeThumb(f.thumb)}))
    if (data.files.length > 50) {
      const more = document.createElement('li')
      more.className = 'more'
      more.textContent = t('moreFiles', {n: data.files.length - 50})
      rows.push(more)
    }
    $('#offer-files').replaceChildren(...rows)
    const risky = data.files.filter(f => isRisky(f.name)).map(f => f.name)
    $('#offer-warn').hidden = !risky.length
    if (risky.length) {
      const list = risky.slice(0, 3).join(', ') + (risky.length > 3 ? ` +${risky.length - 3}` : '')
      $('#offer-warn').textContent = t('riskyFiles', {files: list, name})
    }
    // Say what happens after "Accept" (save picker, straight to Downloads, or preview here),
    // and why, when it's because the files already kept in this page add up.
    const plan = sinkPlan(data.files.length, total)
    const full = inbox.bytes + total > INBOX_BUDGET
    const why = total > MEMORY_SINK_LIMIT ? t('offerBig') : full ? t('offerInboxFull', {size: fmtSize(inbox.bytes)}) : ''
    $('#offer-note').textContent = plan === 'too-big' ? t('tooBigHere', {size: fmtSize(total)})
      : plan === 'disk' ? why + t('offerNoteDisk')
      : plan === 'stream' ? why + t('offerNoteStream')
      : full ? t('offerNoteFull', {size: fmtSize(inbox.bytes)})
      : t('offerNoteMem')
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
    addTransfer(data.tid, {peerId, session, dir: 'in', sinkKind: sink.kind, files: data.files.map(f => ({...f, thumb: safeThumb(f.thumb)}))})
    transferProgress(data.tid, 0)
    resolve(sink)
  })))
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
  if (inc?.sink.kind === 'memory') {
    const info = state.peers.get(peerId)?.info || x?.peer || {displayName: '?', color: 0}
    inbox.add(tid, {from: info.displayName, color: info.color}, inc.sink.results)
  }
  transferState(tid, 'done')
  setPeerStatus(peerId, 'done', {fraction: 1})
  if (!inc) return
  const files = x?.files || []
  alertUser({title: t('nReceived', {n: files.length, name: nameOf(peerId)}), body: fileNames(files), tag: `recv-${tid}`})
  if (inc.sink.kind === 'memory') showReceived(peerId, tid)
  else if (inc.sink.kind === 'disk') toast(t('savedToDisk', {n: files.length}), 4000)
  else toast(t('downloadSaved'), 4000)
}

function onIncomingFailed(peerId, tid, reason) {
  state.incoming.delete(tid)
  transferState(tid, reason === 'cancelled' ? 'cancelled' : 'failed')
  setPeerStatus(peerId, reason === 'cancelled' ? 'cancelled' : 'failed')
}

/** New files arrived: show them in the received-files list (newest group on top). */
function showReceived(peerId, tid) {
  const name = nameOf(peerId)
  chime()
  flagTitle()
  const title = t('receivedTitle', {name})
  if (inbox.isOpen()) return inbox.open({title, highlight: tid})
  // Several batches can arrive while nobody is looking; the list shows them all, so once
  // it has been on screen the later queued opens have nothing new to show.
  enqueue(() => (inbox.has(tid) && !inbox.seen(tid) ? inbox.open({title, highlight: tid}) : null))
}

const inbox = createInbox({
  confirmBox,
  showDialog,
  toast,
  onChange: () => {
    renderInboxButton()
    scheduleTransferRender() // "View files" buttons depend on what's still here
  },
})

function renderInboxButton() {
  const btn = $('#btn-inbox')
  const n = inbox.count
  btn.hidden = n === 0
  $('#inbox-count').textContent = n > 99 ? '99+' : String(n)
  const label = t('inboxCount', {n})
  btn.title = label
  btn.setAttribute('aria-label', label)
}
$('#btn-inbox').addEventListener('click', () => inbox.open())

// ---------- messages: one chat thread per device ----------

/**
 * Threads are keyed by the other device's id, so a conversation survives that device
 * reconnecting (it gets a new peer id). Kept in this page only, never saved.
 * thread: {messages: [{dir: 'in' | 'out', text, at, pending?, failed?}], unread}
 */
const CHAT_KEEP = 200
const chatKey = id => state.peers.get(id)?.info?.deviceId || id

function thread(id) {
  const key = chatKey(id)
  let th = state.chats.get(key)
  if (!th) state.chats.set(key, (th = {messages: [], unread: 0}))
  return th
}

function unreadOf(id) {
  return state.chats.get(chatKey(id))?.unread || 0
}

function pushMessage(id, m) {
  const th = thread(id)
  th.messages.push(m)
  if (th.messages.length > CHAT_KEEP) th.messages.shift()
  return th
}

const chat = createChat({
  list: $('#chat-list'),
  empty: $('#chat-empty'),
  form: $('#chat-form'),
  input: $('#chat-input'),
  typingEl: $('#chat-typing'),
  onTyping: on => sendTyping(on),
  onSend: text => {
    const id = radar.selected
    if (!id || !state.peers.has(id)) {
      toast(t('failed'))
      return false
    }
    sendText(id, text)
  },
  copyText,
})

/** Draw the thread of the device shown in the side panel. */
function renderChat() {
  const id = radar.selected
  if (!id || !state.peers.has(id)) return
  chat.render(chatKey(id), thread(id).messages)
  renderTyping()
}

// ---------- "is typing…" ----------

/** How long "typing" stays up without a refresh from the other side (they resend every ~3 s). */
const TYPING_SHOW_MS = 6000
const typingFrom = new Map() // peerId -> timer that clears their "typing"
let typingTo = null // the device we last told we're typing to

/** We started / stopped typing in the reply box: tell only the device we're talking to. */
function sendTyping(on) {
  const id = on ? radar.selected : null
  if (typingTo && typingTo !== id) sessionFor(typingTo)?.sendTyping(typingTo, false)
  typingTo = id
  if (id && state.peers.has(id)) sessionFor(id)?.sendTyping(id, true)
}

function receiveTyping(peerId, on) {
  clearTimeout(typingFrom.get(peerId))
  if (on && state.peers.has(peerId)) {
    typingFrom.set(peerId, setTimeout(() => receiveTyping(peerId, false), TYPING_SHOW_MS))
  } else typingFrom.delete(peerId)
  radar.setTyping(peerId, typingFrom.has(peerId))
  renderTyping()
}

/** "<name> is typing…" under the open conversation. */
function renderTyping() {
  const id = radar.selected
  chat.showTyping(id && typingFrom.has(id) ? t('isTyping', {name: nameOf(id)}) : null)
}

/** Is this device's conversation on screen right now? */
function chatVisible(id) {
  if (radar.selected !== id || document.hidden) return false
  const r = $('#chat-list').getBoundingClientRect()
  return r.bottom > 0 && r.top < innerHeight
}

function setUnread(id, n) {
  const th = thread(id)
  if (th.unread === n) return
  th.unread = n
  for (const [pid, p] of state.peers) {
    if (chatKey(pid) === chatKey(id)) radar.setUnread(pid, n)
  }
  refresh() // the status bar shows unread dots too
}

function markRead(id) {
  if (id && state.peers.has(id)) setUnread(id, 0)
}

// Coming back to the page with the conversation open counts as reading it, and so does
// scrolling it into view (on phones the panel sits below the radar).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && radar.selected && chatVisible(radar.selected)) markRead(radar.selected)
})
new IntersectionObserver(entries => {
  if (entries.some(e => e.isIntersecting) && radar.selected && !document.hidden) markRead(radar.selected)
}).observe($('#chat-list'))

const messageToasts = new Map() // peerId -> toast element, so a burst updates one toast

function receiveText(peerId, text) {
  // still rate-limited per device (no dialog, so nothing waits and no slot to hold)
  if (!admit(peerId, 'text')) return
  const name = nameOf(peerId)
  if (typingFrom.has(peerId)) receiveTyping(peerId, false) // the message is here: done typing
  pushMessage(peerId, {dir: 'in', text, at: Date.now()})
  renderChat()
  if (chatVisible(peerId)) return chime()
  setUnread(peerId, unreadOf(peerId) + 1)
  chime()
  flagTitle()
  alertUser({title: t('messageFrom', {name}), body: text.slice(0, 140), tag: `msg-${peerId}`})
  const preview = `${name}: ${text.replace(/\s+/g, ' ').slice(0, 70)}${text.length > 70 ? '…' : ''}`
  const old = messageToasts.get(peerId)
  if (old?.isConnected) {
    old.querySelector('span').textContent = preview
    return
  }
  messageToasts.set(peerId, toastAction(preview, t('view'), () => openChat(peerId), 6000))
}

/** Show a device's conversation and put the cursor in the reply box. */
function openChat(id) {
  if (!state.peers.has(id)) return
  selectPeer(id)
  renderChat()
  chat.focus()
  markRead(id)
}

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
  // the phone's browser bar takes the top colour of the sky
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#b9b2f2' : '#090a22')
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
  if (!admit(peerId, 'pair')) return Promise.resolve(false)
  return pairDialog(peerId, request, signal, session).finally(() => release(peerId, 'pair'))
}

function pairDialog(peerId, request, signal, session) {
  return new Promise(resolve => enqueue(settleOnError(resolve, false, async () => {
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
  })))
}

function unpairRecord(record, notifyPeerId) {
  if (notifyPeerId) sessionFor(notifyPeerId)?.tellUnpair(notifyPeerId, record.id)
  removePair(record.id)
  // Leave the room a moment later so the "unpair" message can go out on it.
  setTimeout(() => stopPairSession(record.id), 800)
  toast(t('unpaired', {name: record.name}))
  refreshPeers()
}

function confirmUnpair(record) {
  return confirmBox({title: t('unpairConfirm', {name: record.name}), body: t('unpairBody'), ok: t('unpairOk')})
}

async function unpairPeer(id) {
  const record = pairFor(id)
  if (!record || !(await confirmUnpair(record))) return
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
    btn.addEventListener('click', async () => {
      if (!(await confirmUnpair(rec))) return
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
    onText: receiveText,
    onTyping: receiveTyping,
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

/** Transfers running through the network / room session (pair sessions aren't affected). */
function mainBusy() {
  return [...state.xfers.values()].some(x => isActive(x) && x.session === state.main)
}

/** Switching to another room stops transfers in this one, so ask first if any are running. */
async function okToSwitch() {
  if (!mainBusy()) return true
  return confirmBox({title: t('switchQ'), body: t('leaveBodyBusy'), ok: t('switchOk')})
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
  // Never move rooms under a running transfer; the next check after it ends will do it.
  if (state.mode === 'room' || state.checkingNet || mainBusy()) return
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

/** A mascot tile for picture codes: same picture + colour on every device. */
function pictureTile(id, tag = 'span') {
  const el = document.createElement(tag)
  el.className = 'pic'
  el.dataset.color = String(PICTURES[id][2])
  el.innerHTML = avatarSvg(id)
  return el
}

function renderRoomDialog() {
  const inRoom = state.mode === 'room'
  $('#room-active').hidden = !inRoom
  $('#room-idle').hidden = inRoom
  $('#room-error').hidden = true
  $('#room-scan').hidden = !scannerSupported()
  $('#room-share').hidden = !navigator.share
  if (inRoom) {
    const codeEl = $('#room-code')
    const pics = isPictureCode(state.code)
    const words = isWordCode(state.code)
    $('#room-pics').hidden = !pics
    codeEl.hidden = pics
    if (pics) {
      $('#room-pics').replaceChildren(...pictureIds(state.code).map((id, i) => {
        const cell = document.createElement('figure')
        const n = document.createElement('figcaption')
        n.textContent = `${i + 1}. ${PICTURES[id][lang === 'th' ? 1 : 0]}`
        cell.append(pictureTile(id), n)
        return cell
      }))
      $('#room-pics').setAttribute('aria-label', displayCode(state.code, lang))
      $('#room-pics').setAttribute('role', 'img')
    } else {
      codeEl.classList.toggle('words', words)
      codeEl.replaceChildren(...codeWords(state.code, lang).map(w => {
        const span = document.createElement('span')
        span.textContent = w
        return span
      }))
      codeEl.setAttribute('aria-label', displayCode(state.code, lang))
    }
    $('#room-code-alt').hidden = !words
    $('#room-say').hidden = !words && !pics
    $('#room-say').textContent = pics ? t('picSay') : t('codeSay')
    if (words) $('#room-code-alt').textContent = t('codeAlt', {code: displayCode(state.code, lang === 'th' ? 'en' : 'th')})
    const qr = qrcode(0, 'M')
    qr.addData(roomUrl(state.code))
    qr.make()
    $('#room-qr').innerHTML = qr.createSvgTag({cellSize: 5, margin: 2, scalable: true})
  }
  renderPairList()
}

function openRoomDialog() {
  picked = []
  renderPicPad()
  renderRoomDialog()
  $('#room-input').value = ''
  $('#room-type').hidden = true
  $('#room-type-toggle').setAttribute('aria-expanded', 'false')
  showDialog($('#dlg-room'))
}

// ---------- joining by tapping pictures ----------

let picked = []

function renderPicPad() {
  const pad = $('#pic-pad')
  pad.setAttribute('aria-label', t('joinByPics'))
  if (!pad.children.length || pad.dataset.lang !== lang) {
    pad.dataset.lang = lang
    pad.replaceChildren(...PICTURE_IDS.map(id => {
      const b = pictureTile(id, 'button')
      b.type = 'button'
      b.dataset.pic = id
      b.setAttribute('aria-label', PICTURES[id][lang === 'th' ? 1 : 0])
      b.title = b.getAttribute('aria-label')
      b.addEventListener('click', () => pickPicture(id))
      return b
    }))
  }
  const slots = $('#pic-slots')
  slots.replaceChildren(...Array.from({length: PICTURE_LENGTH}, (_, i) => {
    const id = picked[i]
    const slot = id ? pictureTile(id) : document.createElement('span')
    slot.classList.add('slot')
    if (!id) slot.classList.add('empty')
    if (i === picked.length) slot.classList.add('next')
    return slot
  }))
  const names = picked.map(id => PICTURES[id][lang === 'th' ? 1 : 0]).join(', ')
  slots.setAttribute('aria-label', picked.length ? t('picSlot', {n: picked.length, total: PICTURE_LENGTH, names}) : t('picNone'))
  $('#pic-back').disabled = !picked.length
  pad.classList.toggle('is-full', picked.length >= PICTURE_LENGTH)
}

function pickPicture(id) {
  if (picked.length >= PICTURE_LENGTH) return
  picked.push(id)
  $('#room-error').hidden = true
  renderPicPad()
  if (picked.length === PICTURE_LENGTH) {
    const code = pictureCode(picked)
    // a short beat so the fourth picture is seen landing in its slot
    setTimeout(() => {
      joinCode(code).then(joined => {
        if (!joined) {
          picked = []
          renderPicPad()
        }
      })
    }, 280)
  }
}

$('#pic-back').addEventListener('click', () => {
  picked.pop()
  renderPicPad()
})

$('#room-type-toggle').addEventListener('click', e => {
  const box = $('#room-type')
  box.hidden = !box.hidden
  e.currentTarget.setAttribute('aria-expanded', String(!box.hidden))
  if (!box.hidden) $('#room-input').focus()
})

/** Join a room (asking first if that would stop transfers here). Resolves true if joined. */
async function joinCode(code) {
  if (code === state.code) {
    $('#dlg-room').close()
    return true
  }
  if (!(await okToSwitch())) return false
  $('#dlg-room').close()
  enterRoom(code)
  return true
}

$('#btn-room').addEventListener('click', openRoomDialog)
$('#room-create').addEventListener('click', async () => {
  // Moving to a new room stops transfers on the current network, like joining one does.
  if (!(await okToSwitch())) return
  await enterRoom(newPictureCode())
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
  joinCode(code)
}
$('#room-input').addEventListener('input', () => { $('#room-error').hidden = true })

async function cameraPermission() {
  try {
    return (await navigator.permissions.query({name: 'camera'})).state
  } catch {
    return 'prompt' // some browsers can't tell; explain first, then let the browser ask
  }
}

/** The scanner dialog: explain the camera first (unless it's already allowed), then scan. */
$('#room-scan').addEventListener('click', async () => {
  const dialog = $('#dlg-scan')
  let found = null
  const ask = $('#scan-ask')
  const view = $('#scan-view')
  const showAsk = kind => {
    view.hidden = true
    ask.hidden = false
    ask.dataset.kind = kind
    $('#scan-ask-title').textContent = t(kind === 'denied' ? 'camDeniedTitle' : 'camAskTitle')
    $('#scan-ask-body').textContent = t(kind === 'denied' ? 'camDeniedHelp' : 'camAskBody')
    $('#scan-allow').textContent = t(kind === 'denied' ? 'tryAgain' : 'camAllow')
  }
  const setStatus = key => {
    $('#scan-status').textContent = key === 'camDenied' ? '' : t(key)
    if (key === 'camDenied') showAsk('denied')
  }
  const start = () => {
    ask.hidden = true
    view.hidden = false
    runScanner({dialog, video: $('#scan-video'), setStatus, accept: text => (found = codeFromText(text))})
  }
  $('#scan-allow').onclick = start
  $('#scan-status').textContent = ''
  const perm = await cameraPermission()
  showDialog(dialog).then(async () => {
    if (!found || found === state.code) return
    if (!(await okToSwitch())) return
    if ($('#dlg-room').open) $('#dlg-room').close()
    enterRoom(found)
  })
  if (perm === 'granted') start()
  else showAsk(perm === 'denied' ? 'denied' : 'ask')
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
// The phone's own share sheet (LINE, Messenger, …): the other person just taps the link.
$('#room-share').addEventListener('click', async () => {
  try {
    await navigator.share({title: 'Nearby', text: t('shareText'), url: roomUrl(state.code)})
  } catch (err) {
    if (err?.name === 'AbortError') return // closed the share sheet
    if (await copyText(roomUrl(state.code))) toast(t('linkCopied'))
  }
})

// ---------- "pair so you find each other next time" ----------

let suggestTimer = 0
let suggestPeer = null

/**
 * After the first file sent to someone in a room, offer pairing once: next time the two
 * devices find each other on their own, without a room code. Asked once per device.
 */
function suggestPairing(id) {
  const p = state.peers.get(id)
  const deviceId = p?.info.deviceId
  if (state.mode !== 'room' || !p?.links.has('main') || !deviceId || pairFor(id)) return
  if (knownDevice(deviceId)?.pairAsked || !$('#suggest').hidden) return
  markPairAsked(deviceId)
  suggestPeer = id
  $('#suggest-title').textContent = t('suggestPairTitle', {name: p.info.displayName})
  $('#suggest').dataset.color = String(p.info.color)
  $('#suggest').hidden = false
  $('#tray').hidden = false
  clearTimeout(suggestTimer)
  suggestTimer = setTimeout(hideSuggestion, 30_000)
}

function hideSuggestion() {
  clearTimeout(suggestTimer)
  suggestPeer = null
  $('#suggest').hidden = true
  scheduleTransferRender() // the tray may have nothing else to show
}

$('#suggest-yes').addEventListener('click', () => {
  const id = suggestPeer
  hideSuggestion()
  if (id && state.peers.has(id)) pairWith(id)
})
$('#suggest-no').addEventListener('click', hideSuggestion)
$('#room-leave').addEventListener('click', async () => {
  const ok = await confirmBox({
    title: t('leaveQ', {code: displayCode(state.code, lang)}),
    body: mainBusy() ? t('leaveBodyBusy') : t('leaveBody'),
    ok: t('leaveOk'),
  })
  if (!ok) return
  $('#dlg-room').close()
  enterLocal()
})

window.addEventListener('hashchange', async () => {
  const code = codeFromHash()
  if (!code || code === state.code) return
  if (await okToSwitch()) enterRoom(code)
  else history.replaceState(null, '', location.pathname + location.search + (state.code ? `#r=${state.code}` : ''))
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
/**
 * Files from a drop, without folders: a dropped folder shows up as a File that can't be
 * read, which would fail mid-transfer. Tell the user instead.
 */
function filesFromDrop(dt) {
  if (!dt) return []
  const items = [...(dt.items || [])].filter(it => it.kind === 'file')
  if (!items.length || !items[0].webkitGetAsEntry) return [...(dt.files || [])]
  const files = []
  let folders = 0
  for (const it of items) {
    const entry = it.webkitGetAsEntry()
    if (entry?.isDirectory) folders++
    else {
      const f = it.getAsFile()
      if (f) files.push(f)
    }
  }
  if (folders) toast(t('noFolders'), 4500)
  return files
}

window.addEventListener('drop', e => {
  e.preventDefault()
  hideDropOverlay()
  const files = filesFromDrop(e.dataTransfer)
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
  // a message notification opens that conversation
  if (action === 'open' && tag?.startsWith('msg-')) {
    const peerId = tag.slice(4)
    if (state.peers.has(peerId)) openChat(peerId)
    return
  }
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
  renderInboxButton()
  inbox.render()
  renderPicPad()
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
document.documentElement.classList.remove('booting')
takeSharedItems()
for (const record of loadPairs()) ensurePairSession(record)

const startCode = codeFromHash()
if (startCode) enterRoom(startCode)
else enterLocal()

if (freshIdentity) showSelfHint()
