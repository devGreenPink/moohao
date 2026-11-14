import {mascot, ICONS} from './mascot.js'
import {avatarSvg} from './avatars.js'
import {effectsOn, onPowerChange} from './effects.js'

const RING = 2 * Math.PI * 46

/** Status badge (bottom-right): a shape per state, not just a colour. */
const BADGES = {
  waiting: ICONS.hourglass,
  sending: ICONS.arrowUp,
  receiving: ICONS.arrowDown,
  done: ICONS.check,
  declined: ICONS.alert,
  failed: ICONS.alert,
  cancelled: ICONS.close,
  reconnecting: ICONS.waves,
}

/** Familiarity tag (top-left). */
const TAGS = {
  paired: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  known: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  new: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/></svg>',
}

/**
 * Rings by familiarity, as a fraction of the radar radius: paired devices sit closest to
 * you, devices you've met before in the middle, new ones on the outside.
 */
const TIER_RADIUS = {paired: 0.46, known: 0.64, new: 0.82}
const TIER_ORDER = ['paired', 'known', 'new']

const ORB_PX = 62
const SELF_FRACTION = 0.2 // self orb radius as a fraction of the radar radius

/** One turn of the radar sweep — must match the `sweep` animation in style.css. */
const SWEEP_MS = 7000

/**
 * Radar of nearby devices. Each device is a real <button> placed on the rings.
 *
 * options:
 *  onActivate(id)               – node clicked / Enter / Space
 *  onDropFiles(id, dataTransfer) – files dropped onto a node
 *  describe(info, status, tier) – accessible label for a node
 */
export function createRadar(root, {onActivate, onDropFiles, describe}) {
  const field = root.querySelector('.radar-nodes')
  const beamLayer = root.querySelector('.radar-beams')
  const nodes = new Map() // id -> {el, beam, info, status, tier, angle, r}
  let selected = null
  let radiusPx = root.clientWidth / 2

  function placeBeam(node) {
    const orb = Math.min(ORB_PX, radiusPx * 0.24) / 2
    const start = radiusPx * SELF_FRACTION + 4
    const end = Math.max(start, radiusPx * node.r - orb - 4)
    node.beam.style.setProperty('--a', `${node.angle}rad`)
    node.beam.style.setProperty('--start', `${start}px`)
    node.beam.style.setProperty('--end', `${end}px`)
  }

  /** Room each device gets along its ring before labels start to bump into each other. */
  const MIN_GAP_PX = 118

  function layout() {
    const groups = {paired: [], known: [], new: []}
    for (const [id, n] of nodes) groups[n.tier].push(id)
    let offset = -60
    for (const tier of TIER_ORDER) {
      const ids = groups[tier].sort()
      const count = ids.length
      // Crowded ring (small screen or many devices): alternate in and out so neighbours'
      // labels sit on different heights instead of overlapping.
      const gap = (2 * Math.PI * TIER_RADIUS[tier] * radiusPx) / Math.max(1, count)
      const stagger = count > 2 && gap < MIN_GAP_PX ? 0.07 : 0
      ids.forEach((id, i) => {
        const node = nodes.get(id)
        node.angle = (offset + (i * 360) / count) * (Math.PI / 180)
        node.r = Math.min(0.86, TIER_RADIUS[tier] + (i % 2 ? stagger : -stagger))
        node.el.style.setProperty('--x', `${50 + Math.cos(node.angle) * node.r * 50}%`)
        node.el.style.setProperty('--y', `${50 + Math.sin(node.angle) * node.r * 50}%`)
        node.el.style.setProperty('--delay', `${(i % 6) * -0.6}s`)
        placeBeam(node)
        syncBlip(node)
        fitLabel(node)
      })
      // Stagger rings so devices on different rings don't line up on one ray.
      offset += 360 / Math.max(2, count) / 2 + 23
    }
  }

  /**
   * Keep a device's name label inside the radar: near the left/right edge the label is
   * wider than the space left, so slide it inwards (the avatar stays where it is).
   */
  function fitLabel(node) {
    const w = radiusPx * 2
    if (!w) return
    const x = radiusPx + Math.cos(node.angle) * node.r * radiusPx
    const half = node.el.querySelector('.node-name').offsetWidth / 2
    const pad = -6 // may reach a little past the disc, into the page margin
    let shift = 0
    if (x - half < pad) shift = pad - (x - half)
    else if (x + half > w - pad) shift = w - pad - (x + half)
    node.el.style.setProperty('--shift', `${Math.round(shift)}px`)
  }

  /**
   * "Contact" blip: each node flashes as the sweep line passes over it. The flash is a Web
   * Animation whose start time is pinned to the sweep's own CSS animation, offset by the
   * node's angle, so it stays in step (opacity/transform only, so it runs on the compositor).
   */
  function syncBlip(node) {
    if (!effectsOn()) {
      node.blipAnim?.cancel()
      node.blipAnim = null
      return
    }
    const sweep = root.querySelector('.radar-sweep')?.getAnimations()[0]
    if (!sweep || sweep.startTime == null) return
    node.blipAnim ??= node.el.querySelector('.node-blip').animate([
      {opacity: 0.9, transform: 'scale(0.9)'},
      {opacity: 0, transform: 'scale(1.7)', offset: 0.12},
      {opacity: 0, transform: 'scale(1.7)'},
    ], {duration: SWEEP_MS, iterations: Infinity, easing: 'linear'})
    // The sweep's bright edge starts at 12 o'clock (-90° here) and turns clockwise.
    const deg = (((node.angle * 180) / Math.PI + 90) % 360 + 360) % 360
    node.blipAnim.startTime = sweep.startTime + (deg / 360) * SWEEP_MS
  }

  onPowerChange(() => {
    for (const node of nodes.values()) syncBlip(node)
  })

  /** A little comet flying between you and a device (dir 'out' = from you). */
  function launch(id, dir = 'out') {
    const node = nodes.get(id)
    if (!node || !effectsOn()) return
    const comet = document.createElement('div')
    comet.className = `comet${dir === 'in' ? ' in' : ''}`
    comet.dataset.color = String(node.info.color)
    for (const v of ['--a', '--start', '--end']) comet.style.setProperty(v, node.beam.style.getPropertyValue(v))
    comet.innerHTML = '<i></i>'
    comet.firstChild.addEventListener('animationend', () => comet.remove(), {once: true})
    beamLayer.append(comet)
  }

  /** Burst of stars around a device (or around you when id is null), plus a happy hop. */
  function celebrate(id, selfColor) {
    if (!effectsOn()) return
    const node = id ? nodes.get(id) : null
    if (id && !node) return
    const burst = document.createElement('div')
    burst.className = 'burst'
    burst.style.left = node ? node.el.style.getPropertyValue('--x') : '50%'
    burst.style.top = node ? node.el.style.getPropertyValue('--y') : '50%'
    burst.dataset.color = String(node ? node.info.color : selfColor)
    const count = 12
    burst.innerHTML = Array.from({length: count}, (_, i) => {
      const a = ((i / count) * 360 + Math.random() * 20) * (Math.PI / 180)
      const dist = (node ? 46 : 70) + Math.random() * 18
      const star = i % 3 === 0
      return `<i class="${star ? 'star' : ''}" style="--dx:${(Math.cos(a) * dist).toFixed(1)}px;--dy:${(Math.sin(a) * dist).toFixed(1)}px;--s:${star ? 9 : 4 + Math.round(Math.random() * 3)}px"></i>`
    }).join('')
    field.append(burst)
    setTimeout(() => burst.remove(), 1000)
    const avatar = node ? node.el.querySelector('.node-avatar') : root.querySelector('.self-avatar')
    if (avatar) {
      avatar.classList.remove('is-happy')
      void avatar.offsetWidth // restart the animation if it's already playing
      avatar.classList.add('is-happy')
      avatar.addEventListener('animationend', () => avatar.classList.remove('is-happy'), {once: true})
    }
  }

  new ResizeObserver(() => {
    const next = root.clientWidth / 2
    if (next === radiusPx) return
    radiusPx = next
    layout()
  }).observe(root)

  function refreshLabel(id) {
    const node = nodes.get(id)
    if (node) node.el.setAttribute('aria-label', describe(node.info, node.status, node.tier))
  }

  function create(id, info) {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'node'
    el.setAttribute('aria-pressed', 'false')
    el.innerHTML = `
      <span class="node-orb">
        <svg class="node-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="track" cx="50" cy="50" r="46"/>
          <circle class="bar" cx="50" cy="50" r="46" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/>
        </svg>
        <span class="node-blip" aria-hidden="true"></span>
        <span class="node-avatar" aria-hidden="true"></span>
        <span class="node-badge" aria-hidden="true"></span>
        <span class="node-tag" aria-hidden="true"></span>
      </span>
      <span class="node-name"><span class="node-device" aria-hidden="true"></span><span class="node-label"></span></span>
      <span class="node-status" aria-hidden="true"></span>`

    const beam = document.createElement('div')
    beam.className = 'beam'
    beam.setAttribute('aria-hidden', 'true')
    beam.innerHTML = '<i></i><i></i><i></i><i></i>'
    beamLayer.append(beam)

    const node = {el, beam, info, status: {kind: 'idle'}, tier: 'new', angle: 0, r: TIER_RADIUS.new, look: ''}
    nodes.set(id, node)

    el.addEventListener('click', () => onActivate(id))
    el.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      el.classList.add('is-drag')
    })
    el.addEventListener('dragleave', () => el.classList.remove('is-drag'))
    el.addEventListener('drop', e => {
      e.preventDefault()
      e.stopPropagation()
      el.classList.remove('is-drag')
      if (e.dataTransfer?.files.length) onDropFiles(id, e.dataTransfer)
    })
    field.append(el)
    return node
  }

  /** info: {displayName, avatar, color, device, ...}; tier: 'paired' | 'known' | 'new' */
  function upsert(id, info, {tier = 'new', offline = false} = {}) {
    const node = nodes.get(id) || create(id, info)
    const relayout = node.tier !== tier || !node.placed
    node.info = info
    node.tier = tier
    node.placed = true
    const {el} = node
    el.dataset.color = String(info.color)
    node.beam.dataset.color = String(info.color)
    el.dataset.tier = tier
    el.classList.toggle('is-offline', offline)
    // Only touch the DOM when the look actually changed.
    const look = `${info.avatar}|${info.device}|${tier}`
    if (node.look !== look) {
      el.querySelector('.node-avatar').innerHTML = avatarSvg(info.avatar)
      el.querySelector('.node-device').innerHTML = mascot(info.device)
      el.querySelector('.node-tag').innerHTML = TAGS[tier]
      node.look = look
    }
    const label = el.querySelector('.node-label')
    const renamed = label.textContent !== info.displayName
    if (renamed) label.textContent = info.displayName
    refreshLabel(id)
    if (relayout) layout()
    else if (renamed) fitLabel(node)
  }

  function remove(id) {
    const node = nodes.get(id)
    if (!node) return
    nodes.delete(id)
    if (selected === id) selected = null
    const hadFocus = node.el.contains(document.activeElement)
    node.el.remove()
    node.beam.remove()
    layout()
    if (hadFocus) field.querySelector('.node')?.focus()
  }

  function select(id) {
    selected = id && nodes.has(id) ? id : null
    for (const [nid, node] of nodes) {
      const on = nid === selected
      node.el.classList.toggle('is-selected', on)
      node.el.setAttribute('aria-pressed', String(on))
    }
  }

  /** status: {kind: idle|waiting|sending|receiving|reconnecting|done|declined|failed|cancelled, fraction, text} */
  function setStatus(id, status) {
    const node = nodes.get(id)
    if (!node) return
    const prevKind = node.status.kind
    node.status = status
    const {el} = node
    const kind = status.kind
    const showRing = kind !== 'idle' && kind !== 'declined' && kind !== 'failed' && kind !== 'cancelled'
    if (prevKind !== kind) {
      el.dataset.status = kind
      el.classList.toggle('is-busy', showRing)
      el.querySelector('.node-badge').innerHTML = BADGES[kind] || ''
    }
    const fraction = Math.min(1, Math.max(0, status.fraction || 0))
    el.querySelector('.bar').setAttribute('stroke-dashoffset', String(RING * (1 - (showRing ? fraction : 0))))
    el.querySelector('.node-status').textContent = status.text || ''
    if (prevKind !== kind) refreshLabel(id)
  }

  /** Show particles flowing between you and a device: dir 'out' | 'in' | null. */
  function setBeam(id, dir) {
    const node = nodes.get(id)
    if (!node) return
    node.beam.classList.toggle('on', !!dir)
    node.beam.classList.toggle('in', dir === 'in')
  }

  // Arrow keys move focus between devices, like a toolbar.
  field.addEventListener('keydown', e => {
    const list = [...field.querySelectorAll('.node')]
    const i = list.indexOf(document.activeElement)
    if (i < 0 || !list.length) return
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = list[(i + 1) % list.length]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length]
    else if (e.key === 'Home') next = list[0]
    else if (e.key === 'End') next = list[list.length - 1]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  })

  return {
    upsert,
    remove,
    select,
    setStatus,
    setBeam,
    launch,
    celebrate,
    get size() { return nodes.size },
    get selected() { return selected },
    ids: () => [...nodes.keys()],
    focus: id => nodes.get(id)?.el.focus(),
    setPicking: on => root.classList.toggle('is-picking', on),
  }
}
