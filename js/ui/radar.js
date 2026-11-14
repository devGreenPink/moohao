import {mascot, ICONS} from './mascot.js'
import {avatarSvg} from './avatars.js'

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

/**
 * Radar of nearby devices. Each device is a real <button> placed on the rings.
 *
 * options:
 *  onActivate(id)               – node clicked / Enter / Space
 *  onDropFiles(id, files)       – files dropped onto a node
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

  function layout() {
    const groups = {paired: [], known: [], new: []}
    for (const [id, n] of nodes) groups[n.tier].push(id)
    let offset = -60
    for (const tier of TIER_ORDER) {
      const ids = groups[tier].sort()
      const count = ids.length
      ids.forEach((id, i) => {
        const node = nodes.get(id)
        node.angle = (offset + (i * 360) / count) * (Math.PI / 180)
        // Crowded ring: alternate slightly in and out so labels don't collide.
        node.r = TIER_RADIUS[tier] + (count > 6 ? (i % 2 ? 0.05 : -0.05) : 0)
        node.el.style.setProperty('--x', `${50 + Math.cos(node.angle) * node.r * 50}%`)
        node.el.style.setProperty('--y', `${50 + Math.sin(node.angle) * node.r * 50}%`)
        node.el.style.setProperty('--delay', `${(i % 6) * -0.6}s`)
        placeBeam(node)
      })
      // Stagger rings so devices on different rings don't line up on one ray.
      offset += 360 / Math.max(2, count) / 2 + 23
    }
  }

  new ResizeObserver(() => {
    radiusPx = root.clientWidth / 2
    for (const node of nodes.values()) placeBeam(node)
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
        <span class="node-avatar" aria-hidden="true"></span>
        <span class="node-device" aria-hidden="true"></span>
        <span class="node-badge" aria-hidden="true"></span>
        <span class="node-tag" aria-hidden="true"></span>
      </span>
      <span class="node-name"></span>
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
      const files = [...(e.dataTransfer?.files || [])]
      if (files.length) onDropFiles(id, files)
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
    el.querySelector('.node-name').textContent = info.displayName
    refreshLabel(id)
    if (relayout) layout()
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
    get size() { return nodes.size },
    get selected() { return selected },
    ids: () => [...nodes.keys()],
    focus: id => nodes.get(id)?.el.focus(),
    setPicking: on => root.classList.toggle('is-picking', on),
  }
}
