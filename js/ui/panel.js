import {t} from '../i18n.js'
import {mascot} from './mascot.js'

/**
 * Side panel (bottom sheet on phones), organised in labelled sections:
 *   who it is · Send · Transfers (only while active) · Safety · This device.
 * Views are pre-built in index.html and toggled, so buttons keep focus while progress
 * updates stream in. Transfer cards are rendered into `transferContainer` by the app.
 *
 * view:
 *  {kind: 'searching'} | {kind: 'none'} | {kind: 'pick'} | {kind: 'error', message}
 *  {kind: 'peer', id, info, status, code, tier, history, offline, hasTransfers}
 *    info: {displayName, name, avatar, color, device, os, browser}
 *    code: string (emoji) | null (unavailable) | undefined (still computing)
 */
export function createPanel(root, {onSendFiles, onSendText, onPair, onUnpair, onNickname, onClose, onUseRoom}) {
  const $ = sel => root.querySelector(sel)
  const views = [...root.querySelectorAll('[data-view]')]
  let currentPeer = null
  let lastLook = ''
  let paired = false

  $('#panel-send-files').addEventListener('click', () => currentPeer && onSendFiles(currentPeer))
  $('#panel-send-text').addEventListener('click', () => currentPeer && onSendText(currentPeer))
  $('#panel-pair').addEventListener('click', () => currentPeer && (paired ? onUnpair(currentPeer) : onPair(currentPeer)))
  $('#panel-nickname').addEventListener('click', () => currentPeer && onNickname(currentPeer))
  $('#panel-close').addEventListener('click', () => onClose())
  $('#panel-info').addEventListener('click', () => {
    const text = $('#panel-info-text')
    text.hidden = !text.hidden
    $('#panel-info').setAttribute('aria-expanded', String(!text.hidden))
  })
  root.querySelectorAll('[data-use-room]').forEach(b => b.addEventListener('click', () => onUseRoom()))

  function show(kind) {
    root.dataset.kind = kind
    for (const v of views) v.hidden = v.dataset.view !== kind
  }

  const TAG_TEXT = {paired: 'pairedBadge', known: 'tagKnown', new: 'tagNew'}

  return {
    get peer() { return currentPeer },
    transferContainer: $('#panel-xfers'),

    render(view) {
      show(view.kind)
      const prevPeer = currentPeer
      currentPeer = view.kind === 'peer' ? view.id : null
      if (view.kind === 'error') {
        $('#panel-error-text').textContent = view.message || ''
        return
      }
      if (view.kind !== 'peer') {
        lastLook = ''
        return
      }
      if (prevPeer !== currentPeer) {
        $('#panel-info-text').hidden = true
        $('#panel-info').setAttribute('aria-expanded', 'false')
      }

      const {info, status} = view
      const look = `${info.avatar}|${info.color}|${info.device}`
      if (lastLook !== look) {
        $('#panel-avatar').textContent = info.avatar
        $('#panel-who').dataset.color = String(info.color)
        $('#panel-device').innerHTML = mascot(info.device)
        lastLook = look
      }
      $('#panel-name').textContent = info.displayName
      const sys = [t(info.device), info.os, info.browser].filter(Boolean).join(' · ')
      $('#panel-sub').textContent = info.displayName !== info.name ? `${info.name} · ${sys}` : sys

      const tag = $('#panel-tag')
      tag.dataset.tier = view.tier
      tag.querySelector('span').textContent = t(TAG_TEXT[view.tier])
      $('#panel-history').textContent = view.history || ''
      $('#panel-history').hidden = !view.history

      const state = status?.kind || 'idle'
      const line = $('#panel-state')
      const shown = view.offline ? 'reconnecting' : state === 'idle' || state === 'done' || TERMINAL.has(state) ? 'idle' : state
      line.dataset.state = shown
      // Just the state here ("Sending", "Reconnecting…"); numbers live in the transfer card,
      // so this line doesn't need re-rendering on every progress tick.
      $('#panel-state-text').textContent = view.offline ? t('reconnecting') : shown === 'idle' ? t('connected') : t(shown)

      // Can't start something new with a device that's currently disconnected.
      $('#panel-send-files').disabled = !!view.offline
      $('#panel-send-text').disabled = !!view.offline
      $('#panel-pair').disabled = !!view.offline

      $('#panel-xfers-sec').hidden = !view.hasTransfers

      const hasCode = view.code !== null
      $('#panel-safety').hidden = !hasCode
      const codeEl = $('#panel-code')
      codeEl.textContent = view.code === undefined ? t('verifyPending') : view.code || ''
      codeEl.setAttribute('aria-label', view.code ? `${t('verifyLabel')}: ${[...view.code].join(' ')}` : t('verifyPending'))

      paired = view.tier === 'paired'
      $('#panel-pair').textContent = paired ? t('unpair') : t('pairBtn')
    },
  }
}

const TERMINAL = new Set(['declined', 'failed', 'cancelled'])
