import {t, lang} from '../i18n.js'
import {ICONS} from './mascot.js'

/**
 * Transfer cards: what is being sent/received, which file, how far, how fast.
 * Used in the floating tray (all transfers, compact) and in the side panel (one device).
 * Cards are keyed by transfer id and updated in place, so progress ticks only change text
 * and a transform — no DOM rebuilds.
 *
 * view model: {tid, peerId, peer: {displayName, avatar, color}, dir: 'in'|'out',
 *   status: 'waiting'|'active'|'reconnecting'|'done'|'declined'|'failed'|'cancelled',
 *   files: [{name, size, type, thumb}], done, total, speed, eta,
 *   note: string — what happened / what happens next, in plain words
 *   actions: {retry, open, dismiss} — which buttons to show}
 *
 * The corner button cancels a running transfer and removes a finished one from the list.
 */

export function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Lower-case file extension ("jpg"), or '' if there is none. Shared by the cards, offer and inbox. */
export function fileExt(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

/** Files that run programs or open as web pages when opened: worth a warning. */
export const RISKY_EXT = new Set([
  'exe', 'msi', 'msix', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse',
  'wsf', 'wsh', 'hta', 'lnk', 'url', 'reg', 'jar', 'apk', 'xapk', 'apks', 'aab', 'app', 'dmg', 'pkg', 'sh',
  'command', 'run', 'deb', 'rpm', 'appimage', 'iso', 'html', 'htm', 'xhtml', 'mht', 'docm', 'xlsm', 'pptm',
  'dotm', 'xltm',
])
export const isRisky = name => RISKY_EXT.has(fileExt(name))

/** Which file the byte counter is in. */
function currentFile(files, done) {
  let acc = 0
  for (let i = 0; i < files.length; i++) {
    acc += files[i].size
    if (done < acc) return i
  }
  return Math.max(0, files.length - 1)
}

function title(vm) {
  const name = vm.peer.displayName
  const s = vm.status
  if (s === 'reconnecting') return t('xReconnecting', {name})
  if (s === 'declined') return t('xDeclined', {name})
  if (s === 'failed') return t(vm.dir === 'in' ? 'xFailedIn' : 'xFailed', {name})
  if (s === 'cancelled') return t(vm.dir === 'in' ? 'xCancelledIn' : 'xCancelled', {name})
  if (vm.dir === 'out') return t(s === 'waiting' ? 'xOutWaiting' : s === 'done' ? 'xOutDone' : 'xOutActive', {name})
  return t(s === 'done' ? 'xInDone' : 'xInActive', {name})
}

const ACTIVE = new Set(['waiting', 'active', 'reconnecting'])

export function createTransferList(container, {compact = false, onCancel, onOpen, onSelect, onRetry, onDismiss} = {}) {
  const cards = new Map() // tid -> {el, parts, lastFile}

  function build(vm) {
    const el = document.createElement('div')
    el.className = `xfer${compact ? ' compact' : ''}`
    el.innerHTML = `
      <div class="xfer-head">
        <span class="xfer-dir" aria-hidden="true"></span>
        <span class="xfer-title"></span>
        <button type="button" class="xfer-x icon-btn">${ICONS.close}</button>
      </div>
      <div class="xfer-file">
        <span class="xfer-thumb" aria-hidden="true"></span>
        <span class="xfer-name"></span>
        <span class="xfer-count"></span>
      </div>
      <div class="xfer-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <div class="xfer-meta"><span class="xfer-pct"></span><span class="xfer-rate"></span></div>
      <p class="xfer-note" hidden></p>
      <div class="xfer-actions" hidden>
        <button type="button" class="btn small primary xfer-open" hidden></button>
        <button type="button" class="btn small primary xfer-retry" hidden></button>
        <button type="button" class="btn small ghost xfer-dismiss" hidden></button>
      </div>`
    const parts = {
      dir: el.querySelector('.xfer-dir'),
      title: el.querySelector('.xfer-title'),
      x: el.querySelector('.xfer-x'),
      thumb: el.querySelector('.xfer-thumb'),
      name: el.querySelector('.xfer-name'),
      count: el.querySelector('.xfer-count'),
      bar: el.querySelector('.xfer-bar'),
      fill: el.querySelector('.xfer-bar span'),
      pct: el.querySelector('.xfer-pct'),
      rate: el.querySelector('.xfer-rate'),
      note: el.querySelector('.xfer-note'),
      actions: el.querySelector('.xfer-actions'),
      open: el.querySelector('.xfer-open'),
      retry: el.querySelector('.xfer-retry'),
      dismiss: el.querySelector('.xfer-dismiss'),
    }
    const card = {el, parts, vm, lastFile: -1, lastStatus: null, lang: null, actionsKey: ''}
    // Handlers read card.vm, so they always act on the latest state of the transfer.
    const on = (btn, fn) => btn.addEventListener('click', e => {
      e.stopPropagation()
      fn(card.vm)
    })
    on(parts.x, v => (ACTIVE.has(v.status) ? onCancel?.(v.peerId, v.tid) : onDismiss?.(v.tid)))
    on(parts.open, v => onOpen?.(v.tid))
    on(parts.retry, v => onRetry?.(v.tid))
    on(parts.dismiss, v => onDismiss?.(v.tid))
    if (onSelect) el.addEventListener('click', () => onSelect(card.vm.peerId))
    cards.set(vm.tid, card)
    return card
  }

  function update(card, vm) {
    const {el, parts} = card
    card.vm = vm
    const active = ACTIVE.has(vm.status)
    const langChanged = card.lang !== lang
    if (langChanged) {
      // (re)apply translated labels, e.g. after the user switches language mid-transfer
      card.lang = lang
      parts.open.textContent = t('viewFiles')
      parts.retry.textContent = t('retry')
      parts.dismiss.textContent = t('dismissShort')
      card.lastFile = -1 // refresh "File 2 of 3"
    }
    if (card.lastStatus !== vm.status || langChanged) {
      card.lastStatus = vm.status
      el.dataset.status = vm.status
      el.dataset.dir = vm.dir
      el.dataset.color = String(vm.peer.color)
      parts.dir.innerHTML = vm.status === 'done' ? ICONS.check : vm.dir === 'out' ? ICONS.arrowUp : ICONS.arrowDown
      const label = active ? t(vm.dir === 'in' ? 'cancelReceive' : 'cancelTransfer') : t('dismiss')
      parts.x.title = label
      parts.x.setAttribute('aria-label', label)
    }
    const a = vm.actions || {}
    const key = `${!!a.open}${!!a.retry}${!!a.dismiss}`
    if (card.actionsKey !== key) {
      card.actionsKey = key
      parts.open.hidden = !a.open
      parts.retry.hidden = !a.retry
      parts.dismiss.hidden = !a.dismiss
      parts.actions.hidden = !a.open && !a.retry && !a.dismiss
    }
    if (parts.note.textContent !== (vm.note || '')) {
      parts.note.textContent = vm.note || ''
      parts.note.hidden = !vm.note
    }
    parts.title.textContent = title(vm)

    const i = currentFile(vm.files, vm.done)
    if (card.lastFile !== i) {
      card.lastFile = i
      const f = vm.files[i] || {name: '', size: 0}
      parts.name.textContent = f.name
      parts.thumb.replaceChildren()
      if (f.thumb) {
        const img = document.createElement('img')
        img.src = f.thumb
        img.alt = ''
        parts.thumb.append(img)
      } else {
        parts.thumb.textContent = fileExt(f.name) || 'file'
      }
      parts.count.textContent = vm.files.length > 1 ? t('fileOf', {i: i + 1, n: vm.files.length}) : fmtSize(f.size)
    }

    const fraction = vm.status === 'done' ? 1 : vm.total ? Math.min(1, vm.done / vm.total) : 0
    const pct = Math.floor(fraction * 100)
    parts.fill.style.transform = `scaleX(${fraction})`
    parts.bar.setAttribute('aria-valuenow', String(pct))
    parts.pct.textContent = `${pct}%`
    parts.rate.textContent =
      vm.status === 'active' && vm.speed > 0 ? `${fmtSize(vm.speed)}/s · ${t('eta', {t: fmtTime(vm.eta)})}`
      : vm.status === 'active' || vm.status === 'done' ? `${fmtSize(vm.done)} / ${fmtSize(vm.total)}`
      : ''
  }

  return {
    render(vms) {
      const keep = new Set()
      let prev = null
      for (const vm of vms) {
        keep.add(vm.tid)
        const card = cards.get(vm.tid) || build(vm)
        update(card, vm)
        // keep DOM order = list order, moving only what's out of place
        const want = prev ? prev.nextSibling : container.firstChild
        if (card.el !== want) container.insertBefore(card.el, want)
        prev = card.el
      }
      for (const [tid, card] of cards) {
        if (!keep.has(tid)) {
          card.el.remove()
          cards.delete(tid)
        }
      }
      container.hidden = vms.length === 0
    },
  }
}
