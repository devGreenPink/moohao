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
 *   files: [{name, size, type, thumb}], done, total, speed, eta, canOpen}
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

function ext(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '')
  return m ? m[1] : 'file'
}

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
  if (s === 'failed') return t('xFailed', {name})
  if (s === 'cancelled') return t('xCancelled', {name})
  if (vm.dir === 'out') return t(s === 'waiting' ? 'xOutWaiting' : s === 'done' ? 'xOutDone' : 'xOutActive', {name})
  return t(s === 'done' ? 'xInDone' : 'xInActive', {name})
}

const ACTIVE = new Set(['waiting', 'active', 'reconnecting'])

export function createTransferList(container, {compact = false, onCancel, onOpen, onSelect} = {}) {
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
      <button type="button" class="btn small xfer-open" hidden></button>`
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
      open: el.querySelector('.xfer-open'),
    }
    parts.x.addEventListener('click', e => {
      e.stopPropagation()
      onCancel?.(vm.peerId, vm.tid)
    })
    parts.open.addEventListener('click', e => {
      e.stopPropagation()
      onOpen?.(vm.tid)
    })
    if (onSelect) el.addEventListener('click', () => onSelect(vm.peerId))
    const card = {el, parts, lastFile: -1, lastStatus: null, lang: null}
    cards.set(vm.tid, card)
    return card
  }

  function update(card, vm) {
    const {el, parts} = card
    const active = ACTIVE.has(vm.status)
    if (card.lang !== lang) {
      // (re)apply translated labels, e.g. after the user switches language mid-transfer
      card.lang = lang
      parts.x.title = t('cancelTransfer')
      parts.x.setAttribute('aria-label', t('cancelTransfer'))
      parts.open.textContent = t('viewFiles')
      card.lastFile = -1 // refresh "File 2 of 3"
    }
    if (card.lastStatus !== vm.status) {
      card.lastStatus = vm.status
      el.dataset.status = vm.status
      el.dataset.dir = vm.dir
      el.dataset.color = String(vm.peer.color)
      parts.dir.innerHTML = vm.status === 'done' ? ICONS.check : vm.dir === 'out' ? ICONS.arrowUp : ICONS.arrowDown
      parts.x.hidden = !active
      parts.open.hidden = !vm.canOpen
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
        parts.thumb.textContent = ext(f.name)
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
