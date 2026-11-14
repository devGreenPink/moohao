import {t, lang, setLang, applyStatic} from './i18n.js'
import {createSession, detectNetworkRoom, codeRoom, newRoomCode, normalizeCode, MAX_FILE_BYTES} from './net.js'
import {qrcode} from '../vendor/vendor.js'

const $ = sel => document.querySelector(sel)

const ICONS = {
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  tablet: '<svg viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
}

const RING = 2 * Math.PI * 46

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
  mode: 'local', // 'local' | 'room' | 'offline'
  code: null,
  netRoom: undefined, // undefined = not looked up yet, null = failed
  peers: new Map(), // peerId -> {info, el, busy, clearTimer}
  pending: null, // {kind: 'files', files} | {kind: 'text', text}
  targetPeer: null, // peer chosen before opening the file picker
  incoming: new Map(), // tid -> {start, total}
  offerPeer: null, // peer whose offer dialog is open
}

// ---------- peers UI ----------

function peerSub(info) {
  return [info.os, info.browser].filter(Boolean).join(' · ') || t(info.device)
}

function upsertPeer(id, info) {
  let p = state.peers.get(id)
  if (!p) {
    const el = document.createElement('div')
    el.className = 'peer'
    el.innerHTML = `
      <button class="peer-main" type="button">
        <span class="avatar">
          <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="track" cx="50" cy="50" r="46"/>
            <circle class="bar" cx="50" cy="50" r="46" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/>
          </svg>
          <span class="icon"></span>
        </span>
        <span class="name"></span>
        <span class="sub"></span>
        <span class="status"></span>
      </button>
      <button class="peer-msg" type="button">${ICONS.message}</button>`
    p = {info, el, busy: false, clearTimer: 0}
    state.peers.set(id, p)

    el.querySelector('.peer-main').addEventListener('click', () => onPeerClick(id))
    el.querySelector('.peer-msg').addEventListener('click', () => openCompose(id))

    el.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      el.classList.add('drag')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drag'))
    el.addEventListener('drop', e => {
      e.preventDefault()
      e.stopPropagation()
      el.classList.remove('drag')
      hideDropOverlay()
      const files = [...(e.dataTransfer?.files || [])]
      if (files.length) sendFiles(id, files)
    })

    $('#peers').append(el)
  }
  p.info = info
  p.el.querySelector('.icon').innerHTML = ICONS[info.device] || ICONS.desktop
  p.el.querySelector('.name').textContent = info.name
  p.el.querySelector('.sub').textContent = peerSub(info)
  p.el.querySelector('.peer-main').title = t('tapToSend')
  p.el.querySelector('.peer-msg').title = t('sendText')
  p.el.querySelector('.peer-msg').setAttribute('aria-label', t('sendText'))
  updateEmpty()
}

function removePeer(id) {
  const p = state.peers.get(id)
  if (!p) return
  state.peers.delete(id)
  clearTimeout(p.clearTimer)
  p.el.remove()
  if (state.offerPeer === id && $('#dlg-offer').open) $('#dlg-offer').close('no')
  updateEmpty()
}

function clearPeers() {
  for (const id of [...state.peers.keys()]) removePeer(id)
}

/** state: waiting | sending | receiving | done | declined | failed */
function setPeerStatus(id, status, fraction = 0, speed = 0) {
  const p = state.peers.get(id)
  if (!p) return
  clearTimeout(p.clearTimer)
  const statusEl = p.el.querySelector('.status')
  const bar = p.el.querySelector('.ring .bar')
  statusEl.className = 'status'
  const active = status === 'waiting' || status === 'sending' || status === 'receiving'
  p.el.classList.toggle('busy', active || status === 'done')
  bar.setAttribute('stroke-dashoffset', String(RING * (1 - Math.min(1, Math.max(0, fraction)))))

  if (status === 'waiting') {
    statusEl.textContent = t('waiting')
  } else if (status === 'sending' || status === 'receiving') {
    const pct = Math.floor(fraction * 100)
    statusEl.textContent = speed > 0 ? `${pct}% · ${fmtSize(speed)}/s` : `${t(status)} ${pct}%`
  } else {
    statusEl.textContent = t(status)
    statusEl.classList.add(status === 'done' ? 'ok' : 'bad')
    p.clearTimer = setTimeout(() => {
      statusEl.textContent = ''
      p.el.classList.remove('busy')
      bar.setAttribute('stroke-dashoffset', String(RING))
    }, status === 'done' ? 2500 : 4000)
  }
}

function updateEmpty() {
  const has = state.peers.size > 0
  $('#empty').hidden = has
  $('#peers').hidden = !has
  $('#empty-text').textContent =
    state.mode === 'room' ? t('emptyRoom', {code: state.code})
    : state.mode === 'offline' ? t('ipFailed')
    : t('emptyLocal')
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
  updateEmpty()
}

function renderMe() {
  $('#me-name').textContent = me.name
  $('#me-avatar').innerHTML = `<span class="icon">${ICONS[me.device]}</span>`
}

// ---------- sending ----------

function onPeerClick(id) {
  if (state.pending) {
    const pending = state.pending
    setPending(null)
    if (pending.kind === 'files') sendFiles(id, pending.files)
    else sendText(id, pending.text)
    return
  }
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
  $('#stage').classList.toggle('pick', !!pending)
  if (pending) {
    const what = pending.kind === 'files' ? t('pastedFiles', {n: pending.files.length}) : t('pastedText')
    $('#pending-text').textContent = t('pickRecipient', {what: lang === 'th' ? what : ` ${what}`})
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
    const list = $('#offer-files')
    list.replaceChildren(...data.files.slice(0, 50).map(f => fileRow(f, {thumb: safeThumb(f.thumb)})))

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
  onError: (() => {
    let last = 0
    return msg => {
      if (Date.now() - last < 15_000) return
      last = Date.now()
      toast(t('joinError', {msg}), 5000)
    }
  })(),
}

async function switchSession(config) {
  const old = state.session
  state.session = null
  clearPeers()
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
  if (state.netRoom === undefined) state.netRoom = await detectNetworkRoom()
  if (state.mode !== 'local') return // user switched to a room while we were looking up
  if (!state.netRoom) {
    state.mode = 'offline'
    updateMode()
    await switchSession(null)
    return
  }
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

$('#btn-room').addEventListener('click', () => {
  renderRoomDialog()
  $('#room-input').value = ''
  showDialog($('#dlg-room'))
})
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
  if (state.peers.size === 1) sendFiles([...state.peers.keys()][0], files)
  else setPending({kind: 'files', files})
})

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.pending && !document.querySelector('dialog[open]')) setPending(null)
})

// ---------- header controls ----------

function effectiveTheme() {
  return document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}
function renderThemeIcon() {
  $('#btn-theme').innerHTML = effectiveTheme() === 'dark' ? ICONS.sun : ICONS.moon
}
$('#btn-theme').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  store('nearby.theme', next)
  renderThemeIcon()
})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeIcon)

$('#btn-lang').addEventListener('click', () => {
  setLang(lang === 'th' ? 'en' : 'th')
  applyStatic()
  updateMode()
  for (const [id, p] of state.peers) upsertPeer(id, p.info)
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

applyStatic()
renderThemeIcon()
renderMe()
updateMode()

const startCode = codeFromHash()
if (startCode) enterRoom(startCode)
else enterLocal()
