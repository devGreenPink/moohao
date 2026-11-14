import {t} from '../i18n.js'
import {ICONS} from './mascot.js'

/**
 * Hero heading + scan bar. One of four states:
 *  searching – just started, nothing found yet
 *  found     – at least one device on the radar
 *  none      – searched a while, nothing found (help is shown in the panel)
 *  error     – offline, network lookup failed, or signaling error
 */
export function createScanStatus(root) {
  const $ = sel => root.querySelector(sel)
  const heroTitle = $('#hero-title')
  const heroSub = $('#hero-sub')
  const bar = $('#scan')
  const icon = $('#scan-icon')
  const title = $('#scan-title')
  const detail = $('#scan-detail')
  const count = $('#scan-count')
  const roomBtn = $('#scan-room')

  return {
    /** {kind, count, mode, code, message} */
    set({kind, count: n = 0, mode, code, message}) {
      bar.dataset.state = kind
      root.dataset.scan = kind
      icon.innerHTML = kind === 'error' ? ICONS.alert : ICONS.waves
      roomBtn.hidden = kind !== 'error' && kind !== 'none'

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
        detail.textContent = t('scanDetailNone')
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
      count.textContent = t('countLabel', {n})
    },
  }
}
