// The conversation with one device, shown in the side panel: speech bubbles both ways
// (yours on the right), links you can open, a copy button on each message, and a reply box.
// Threads live in the app's state (this page only, never saved); this module only draws one.
//
// Received text is only ever put into the page with textContent; links are made from
// http(s) URLs found in it and open in a new tab with no opener.

import {t} from '../i18n.js'
import {ICONS} from './mascot.js'

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

/** Text with http(s) links turned into <a> elements, everything else as plain text. */
function linkified(text) {
  const frag = document.createDocumentFragment()
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    // don't swallow trailing punctuation: "see https://x.y/z." → link without the dot
    const url = m[0].replace(/[.,!?)\]]+$/, '')
    if (m.index > last) frag.append(text.slice(last, m.index))
    let href = null
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href
    } catch {}
    if (href) {
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = url
      frag.append(a)
    } else frag.append(url)
    last = m.index + url.length
  }
  if (last < text.length) frag.append(text.slice(last))
  return frag
}

const timeOf = ts => new Date(ts).toLocaleTimeString(document.documentElement.lang || undefined, {hour: '2-digit', minute: '2-digit'})

/**
 * options: {list, empty, form, input, onSend(text), copyText(text) → Promise<boolean>}
 * Messages: [{dir: 'in' | 'out', text, at, pending?, failed?}]
 */
export function createChat({list, empty, form, input, onSend, copyText}) {
  let rendered = '' // what's on screen, so frequent panel refreshes don't redraw for nothing

  function bubble(m) {
    const li = document.createElement('li')
    li.className = `msg msg-${m.dir}${m.failed ? ' failed' : ''}${m.pending ? ' pending' : ''}`
    const b = document.createElement('div')
    b.className = 'msg-bubble'
    const p = document.createElement('p')
    p.className = 'msg-text'
    p.append(linkified(m.text))
    const meta = document.createElement('span')
    meta.className = 'msg-meta'
    meta.textContent = m.failed ? t('notSent') : timeOf(m.at)
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'msg-copy'
    copy.innerHTML = ICONS.copy
    copy.title = t('copy')
    copy.setAttribute('aria-label', t('copy'))
    copy.addEventListener('click', async () => {
      if (await copyText(m.text)) {
        copy.innerHTML = ICONS.check
        copy.title = t('copied')
        setTimeout(() => { copy.innerHTML = ICONS.copy; copy.title = t('copy') }, 1500)
      }
    })
    meta.append(copy)
    b.append(p, meta)
    li.append(b)
    return li
  }

  /** Grow the reply box with its text, up to about four lines. */
  function fit() {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`
  }

  form.addEventListener('submit', e => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    onSend(text)
    input.value = ''
    fit()
    input.focus()
  })
  input.addEventListener('input', fit)
  input.addEventListener('keydown', e => {
    // Enter sends, Shift+Enter is a new line (and never while an input method is composing)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  return {
    /** Draw a thread (key identifies it, so switching devices always redraws). */
    render(key, messages) {
      const sig = `${key}|${messages.length}|${messages.filter(m => m.failed).length}|${messages.filter(m => m.pending).length}|${document.documentElement.lang}`
      if (sig === rendered) return
      const sameThread = rendered.split('|')[0] === String(key)
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
      rendered = sig
      list.replaceChildren(...messages.map(bubble))
      empty.hidden = messages.length > 0
      // stay at the newest message unless the user scrolled up to read older ones
      if (!sameThread || nearBottom) list.scrollTop = list.scrollHeight
    },
    focus() {
      input.focus()
      input.scrollIntoView({block: 'nearest'})
    },
  }
}
