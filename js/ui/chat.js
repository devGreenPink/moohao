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

/** While typing, remind the other side at most this often; stop after this long without a key. */
const TYPING_REPEAT_MS = 3000
const TYPING_IDLE_MS = 4000

/**
 * options: {list, empty, form, input, typingEl, onSend(text), onTyping(on),
 *           copyText(text) → Promise<boolean>}
 * Messages: [{dir: 'in' | 'out', text, at, pending?, failed?}]
 */
export function createChat({list, empty, form, input, typingEl, onSend, onTyping, copyText}) {
  let rendered = '' // what's on screen, so frequent panel refreshes don't redraw for nothing

  // "is typing" for the other side: on while there's text and keys keep coming, off after
  // a few quiet seconds, on send, on leaving the box, or when switching conversation
  let typingOn = false
  let typingSentAt = 0
  let idleTimer = 0
  function typing(on) {
    clearTimeout(idleTimer)
    if (on) {
      const now = Date.now()
      if (!typingOn || now - typingSentAt > TYPING_REPEAT_MS) {
        typingOn = true
        typingSentAt = now
        onTyping?.(true)
      }
      idleTimer = setTimeout(() => typing(false), TYPING_IDLE_MS)
    } else if (typingOn) {
      typingOn = false
      onTyping?.(false)
    }
  }
  // One reply box, but a draft per conversation: switching device keeps what you typed
  // for the other one, and never sends it to the wrong device.
  const drafts = new Map()
  let currentKey = null
  // Touch keyboards have no Shift+Enter, so there Enter makes a new line and the send
  // button sends; with a real keyboard Enter sends.
  const touch = matchMedia('(pointer: coarse)')
  const setEnterHint = () => { input.enterKeyHint = touch.matches ? 'enter' : 'send' }
  setEnterHint()
  touch.addEventListener?.('change', setEnterHint)

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
    if (onSend(text) === false) return // nowhere to send it: keep what was typed
    typing(false)
    input.value = ''
    drafts.delete(currentKey)
    fit()
    input.focus()
  })
  input.addEventListener('input', () => {
    fit()
    if (currentKey !== null) drafts.set(currentKey, input.value)
    typing(input.value.trim().length > 0)
  })
  input.addEventListener('blur', () => typing(false))
  input.addEventListener('keydown', e => {
    // Enter sends, Shift+Enter is a new line (and never while an input method is composing)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch.matches) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  return {
    /** Draw a thread (key identifies it, so switching devices always redraws). */
    render(key, messages) {
      if (key !== currentKey) {
        // switching conversation: put away this one's draft, bring back the other's
        typing(false)
        if (currentKey !== null) drafts.set(currentKey, input.value)
        currentKey = key
        input.value = drafts.get(key) || ''
        fit()
      }
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
    /** Show "<name> is typing…" under the conversation, or hide it (null). */
    showTyping(label) {
      typingEl.hidden = !label
      typingEl.querySelector('.who').textContent = label || ''
      if (label) {
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
        if (nearBottom) list.scrollTop = list.scrollHeight
      }
    },
  }
}
