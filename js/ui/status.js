import {t} from '../i18n.js'
import {ICONS} from './mascot.js'
import {avatarSvg} from './avatars.js'

/** While nothing has been found for a while, the bar's second line cycles through these. */
const TIPS = ['tipOpenOther', 'tipSameWifi', 'tipRoom', 'tipPublicWifi']
const TIP_MS = 6000
/** Found devices shown as little mascots in the bar; the rest become "+N". */
const CREW_MAX = 5

/**
 * Hero heading + scan bar. One of four states:
 *  searching – just started, nothing found yet
 *  found     – at least one device on the radar
 *  none      – searched a while, nothing found (help is shown in the panel)
 *  error     – offline, network lookup failed, or signaling error
 *
 * The bar shows who was found (tap a mascot to pick that device), a "listening" pulse while
 * nobody is there yet, and one button that fits the moment: use a room code (same network,
 * nobody found), invite a friend (in a room, nobody here yet), or nothing once someone is.
 *
 * handlers: onSelect(id), onUseRoom(), onInvite()
 */
export function createScanStatus(root, {onSelect, onUseRoom, onInvite} = {}) {
  const $ = sel => root.querySelector(sel)
  const heroTitle = $('#hero-title')
  const heroSub = $('#hero-sub')
  const bar = $('#scan')
  const icon = $('#scan-icon')
  const title = $('#scan-title')
  const detail = $('#scan-detail')
  const crew = $('#scan-crew')
  const count = $('#scan-count')
  const action = $('#scan-action')
  let iconKind = null
  let crewKey = ''
  let tipTimer = 0
  let tipIndex = 0
  let lastKind = null

  action.addEventListener('click', () => (action.dataset.act === 'invite' ? onInvite?.() : onUseRoom?.()))

  function renderCrew(kind, peers) {
    const key = kind === 'found' ? peers.map(p => `${p.id}:${p.avatar}:${p.color}:${p.name}`).join('|') : kind
    if (key === crewKey) return
    crewKey = key
    if (kind === 'error') return crew.replaceChildren()
    if (kind !== 'found') {
      // nobody yet: three soft dots, "listening"
      const dots = document.createElement('span')
      dots.className = 'listen'
      dots.setAttribute('aria-hidden', 'true')
      dots.innerHTML = '<i></i><i></i><i></i>'
      crew.replaceChildren(dots)
      crew.removeAttribute('aria-label')
      return
    }
    const shown = peers.slice(0, CREW_MAX).map(p => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'crew-mate'
      b.dataset.color = String(p.color)
      b.innerHTML = avatarSvg(p.avatar)
      b.title = p.name
      b.setAttribute('aria-label', p.name)
      b.addEventListener('click', () => onSelect?.(p.id))
      return b
    })
    if (peers.length > CREW_MAX) {
      const more = document.createElement('span')
      more.className = 'crew-more'
      more.textContent = `+${peers.length - CREW_MAX}`
      shown.push(more)
    }
    crew.replaceChildren(...shown)
    crew.setAttribute('aria-label', t('crewLabel'))
  }

  function stopTips() {
    clearInterval(tipTimer)
    tipTimer = 0
  }

  function startTips() {
    if (tipTimer) return
    tipIndex = 0
    detail.textContent = t(TIPS[0])
    tipTimer = setInterval(() => {
      if (document.hidden) return
      tipIndex = (tipIndex + 1) % TIPS.length
      detail.classList.remove('tip-in')
      void detail.offsetWidth // restart the fade
      detail.textContent = t(TIPS[tipIndex])
      detail.classList.add('tip-in')
    }, TIP_MS)
  }

  return {
    /** {kind, count, mode, code, message, peers: [{id, name, avatar, color}]} */
    set({kind, count: n = 0, mode, code, message, peers = []}) {
      bar.dataset.state = kind
      root.dataset.scan = kind
      // Only swap the icon when it changes, so its wave animation doesn't restart.
      const wantIcon = kind === 'error' ? 'alert' : 'waves'
      if (iconKind !== wantIcon) {
        icon.innerHTML = ICONS[wantIcon]
        iconKind = wantIcon
      }

      // the one action that helps right now
      const act = kind === 'found' ? null
        : mode === 'room' && kind !== 'error' ? 'invite'
        : kind === 'none' || kind === 'error' ? 'room'
        : null
      action.hidden = !act
      if (act) {
        action.dataset.act = act
        action.textContent = t(act === 'invite' ? 'inviteFriend' : 'useRoom')
      }

      const where = mode === 'room' ? t('scanDetailRoom', {code}) : t('scanDetailLocal')
      if (kind === 'found') {
        heroTitle.textContent = t('heroFound')
        heroSub.textContent = t('heroSub')
        title.textContent = t('scanFound', {n})
        detail.textContent = t('scanDetailFound')
      } else if (kind === 'none') {
        heroTitle.textContent = t('heroNone')
        heroSub.textContent = t('heroSubNone')
        title.textContent = t('scanNone')
      } else if (kind === 'error') {
        heroTitle.textContent = t('heroError')
        heroSub.textContent = message || ''
        title.textContent = t('scanError')
        detail.textContent = message || ''
      } else {
        heroTitle.textContent = t('heroSearching')
        heroSub.textContent = t('heroSub')
        title.textContent = t('scanSearching')
        detail.textContent = where
      }
      // nothing found for a while: rotate helpful tips (restart them after a language switch)
      if (kind === 'none') {
        if (lastKind !== 'none') stopTips()
        if (!tipTimer) startTips()
        else detail.textContent = t(TIPS[tipIndex])
      } else stopTips()
      lastKind = kind

      count.hidden = kind !== 'found' || !n
      count.textContent = t('countLabel', {n})
      renderCrew(kind, peers)
    },
  }
}
