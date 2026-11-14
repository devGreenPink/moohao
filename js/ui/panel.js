import {t} from '../i18n.js'
import {mascot} from './mascot.js'

/**
 * Side panel (bottom card on phones). Views are pre-built in index.html and toggled,
 * so buttons keep focus while transfer progress updates stream in.
 *
 * view:
 *  {kind: 'searching'} | {kind: 'none'} | {kind: 'pick'} | {kind: 'error', message}
 *  {kind: 'peer', id, info, status: {kind, text}}
 */
export function createPanel(root, {onSendFiles, onSendText, onClose, onUseRoom}) {
  const $ = sel => root.querySelector(sel)
  const views = [...root.querySelectorAll('[data-view]')]
  let currentPeer = null
  let lastDevice = null

  $('#panel-send-files').addEventListener('click', () => currentPeer && onSendFiles(currentPeer))
  $('#panel-send-text').addEventListener('click', () => currentPeer && onSendText(currentPeer))
  $('#panel-close').addEventListener('click', () => onClose())
  root.querySelectorAll('[data-use-room]').forEach(b => b.addEventListener('click', () => onUseRoom()))

  function show(kind) {
    root.dataset.kind = kind
    for (const v of views) v.hidden = v.dataset.view !== kind
  }

  return {
    get peer() { return currentPeer },

    render(view) {
      show(view.kind)
      currentPeer = view.kind === 'peer' ? view.id : null
      if (view.kind === 'error') {
        $('#panel-error-text').textContent = view.message || ''
        return
      }
      if (view.kind !== 'peer') {
        lastDevice = null
        return
      }

      const {info, status} = view
      if (lastDevice !== info.device) {
        $('#panel-mascot').innerHTML = mascot(info.device)
        $('#panel-mascot').dataset.device = info.device
        lastDevice = info.device
      }
      $('#panel-name').textContent = info.name
      $('#panel-sub').textContent = [t(info.device), info.os, info.browser].filter(Boolean).join(' · ')

      const state = status?.kind || 'idle'
      const line = $('#panel-state')
      line.dataset.state = state
      $('#panel-state-text').textContent = state === 'idle' ? t('connected') : status.text
      const busy = state === 'waiting' || state === 'sending' || state === 'receiving'
      $('#panel-send-files').disabled = busy
    },
  }
}
