import {mascot, ICONS} from './mascot.js'

const RING = 2 * Math.PI * 46

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

/**
 * Radar of nearby devices. Each device is a real <button> placed on the rings.
 *
 * options:
 *  onActivate(id)          – node clicked / Enter / Space
 *  onDropFiles(id, files)  – files dropped onto a node
 *  describe(info, status)  – accessible label for a node
 */
export function createRadar(root, {onActivate, onDropFiles, describe}) {
  const field = root.querySelector('.radar-nodes')
  const nodes = new Map() // id -> {el, info, status}
  let selected = null

  function layout() {
    const ids = [...nodes.keys()].sort()
    const n = ids.length
    ids.forEach((id, i) => {
      // Spread evenly around the circle, starting upper-right; alternate two rings when
      // crowded so names below the icons don't collide.
      const angle = (-60 + (i * 360) / n) * (Math.PI / 180)
      const r = n >= 4 ? (i % 2 ? 0.8 : 0.56) : n === 1 ? 0.6 : 0.66
      const el = nodes.get(id).el
      el.style.setProperty('--x', `${50 + Math.cos(angle) * r * 50}%`)
      el.style.setProperty('--y', `${50 + Math.sin(angle) * r * 50}%`)
      el.style.setProperty('--delay', `${(i % 6) * -0.6}s`)
    })
  }

  function refreshLabel(id) {
    const node = nodes.get(id)
    if (node) node.el.setAttribute('aria-label', describe(node.info, node.status, node.paired))
  }

  function upsert(id, info, {paired = false, offline = false} = {}) {
    let node = nodes.get(id)
    if (!node) {
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
          <span class="node-mascot"></span>
          <span class="node-badge" aria-hidden="true"></span>
          <span class="node-pair" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></span>
        </span>
        <span class="node-name"></span>
        <span class="node-status" aria-hidden="true"></span>`
      node = {el, info, status: {kind: 'idle'}}
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
      layout()
    }
    node.info = info
    node.paired = paired
    node.el.classList.toggle('is-paired', paired)
    node.el.classList.toggle('is-offline', offline)
    node.el.dataset.device = info.device
    node.el.querySelector('.node-mascot').innerHTML = mascot(info.device)
    node.el.querySelector('.node-name').textContent = info.name
    refreshLabel(id)
  }

  function remove(id) {
    const node = nodes.get(id)
    if (!node) return
    nodes.delete(id)
    if (selected === id) selected = null
    const hadFocus = node.el.contains(document.activeElement)
    node.el.remove()
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

  /** status: {kind: idle|waiting|sending|receiving|done|declined|failed, fraction, text} */
  function setStatus(id, status) {
    const node = nodes.get(id)
    if (!node) return
    node.status = status
    const {el} = node
    const kind = status.kind
    el.dataset.status = kind
    const showRing = kind !== 'idle' && kind !== 'declined' && kind !== 'failed' && kind !== 'cancelled'
    el.classList.toggle('is-busy', showRing)
    const fraction = Math.min(1, Math.max(0, status.fraction || 0))
    el.querySelector('.bar').setAttribute('stroke-dashoffset', String(RING * (1 - (showRing ? fraction : 0))))
    el.querySelector('.node-badge').innerHTML = BADGES[kind] || ''
    el.querySelector('.node-status').textContent = status.text || ''
    refreshLabel(id)
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
    get size() { return nodes.size },
    get selected() { return selected },
    ids: () => [...nodes.keys()],
    focus: id => nodes.get(id)?.el.focus(),
    setPicking: on => root.classList.toggle('is-picking', on),
  }
}
