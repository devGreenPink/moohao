// Received files: everything that arrived into memory stays here (in this page only) until
// the user saves, deletes or clears it, or closes the page. Also the preview viewer for
// images, video, audio, PDF and plain text.
//
// Safety: received files come from another device, so a preview never renders a file as a
// page. Each preview gets its own Blob whose type we choose from the kind we detected
// (image/video/audio/PDF), text is shown with textContent, and anything else isn't shown.

import {t, lang} from '../i18n.js'
import {ICONS} from './mascot.js'
import {fmtSize, fileExt, isRisky} from './transfers.js'
import {effectsOn} from './effects.js'

const $ = sel => document.querySelector(sel)

/** Above this much held in memory, the note turns into a gentle warning. */
const BIG_INBOX = 1024 ** 3
const TEXT_PREVIEW_BYTES = 200 * 1024
/** How long the viewer keeps the current file up while the next image decodes. */
const DECODE_WAIT_MS = 350
const SLIDE_MS = 260
/** Only images this small are decoded ahead: a 48 MP photo decodes to ~190 MB. */
const PRELOAD_MAX_BYTES = 8 * 1024 * 1024

const wait = ms => new Promise(r => setTimeout(r, ms))

const EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'],
  video: ['mp4', 'webm', 'm4v', 'mov', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'],
  pdf: ['pdf'],
  text: ['txt', 'md', 'csv', 'json', 'log', 'srt', 'vtt', 'xml', 'yaml', 'yml', 'ini'],
}


/** 'image' | 'video' | 'audio' | 'pdf' | 'text' | null */
export function previewKind({name, type = ''}) {
  const e = fileExt(name)
  const ty = String(type).toLowerCase()
  if (ty.startsWith('image/') || EXT.image.includes(e)) return 'image'
  if (ty.startsWith('video/') || EXT.video.includes(e)) return 'video'
  if (ty.startsWith('audio/') || EXT.audio.includes(e)) return 'audio'
  if (ty === 'application/pdf' || e === 'pdf') return 'pdf'
  if (/^text\/(plain|csv|markdown)/.test(ty) || ty === 'application/json' || EXT.text.includes(e)) return 'text'
  return null
}

/** The MIME type used for the preview copy: always one of the kind we decided on. */
function previewType(kind, {name, type = ''}) {
  const ty = String(type).toLowerCase()
  const e = fileExt(name)
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'image') {
    if (/^image\/[\w.+-]+$/.test(ty)) return ty
    return e === 'svg' ? 'image/svg+xml' : e === 'jpg' ? 'image/jpeg' : `image/${e || 'png'}`
  }
  if (kind === 'video') return /^video\/[\w.+-]+$/.test(ty) ? ty : e === 'webm' ? 'video/webm' : e === 'mov' ? 'video/quicktime' : 'video/mp4'
  if (kind === 'audio') return /^audio\/[\w.+-]+$/.test(ty) ? ty : e === 'mp3' ? 'audio/mpeg' : e === 'm4a' ? 'audio/mp4' : `audio/${e || 'mpeg'}`
  return 'text/plain'
}

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString(document.documentElement.lang || undefined, {hour: '2-digit', minute: '2-digit'})
}

/**
 * options:
 *  confirmBox({title, body, ok}) → Promise<boolean>
 *  showDialog(dialog) → Promise<returnValue>
 *  onChange() — the list changed (counts, which transfers still have files)
 *  toast(text) — a short message
 */
export function createInbox({confirmBox, showDialog, onChange, toast}) {
  /** {id, tid, from, color, name, type, size, blob, url, thumbUrl, saved, at} in arrival order */
  let items = []
  let nextId = 1
  let highlightTid = null
  /** When the list was last on screen: a file that arrived before this has been seen. */
  let lastShownAt = 0
  const dlg = $('#dlg-received')
  const list = $('#received-groups')
  /**
   * Built rows, reused across renders (id → {li, sub}): a save or delete only touches its
   * own row, and image thumbnails are decoded once instead of on every change.
   */
  const rows = new Map()
  let rowsLang = null

  const urlOf = it => (it.url ??= URL.createObjectURL(it.blob))
  // One image URL per file (thumbnail and viewer share it, so it decodes once), kept with the
  // file and revoked when it is deleted: a thumbnail that never loads can't pin the image.
  const imageUrl = it => (it.thumbUrl ??= URL.createObjectURL(new Blob([it.blob], {type: previewType('image', it)})))
  const bytes = () => items.reduce((s, it) => s + it.size, 0)
  const unsaved = () => items.filter(it => !it.saved).length

  /** Display order: newest transfer first, files within a transfer in their sent order. */
  function ordered() {
    const groups = new Map()
    for (const it of items) {
      if (!groups.has(it.tid)) groups.set(it.tid, [])
      groups.get(it.tid).push(it)
    }
    return [...groups.values()].reverse()
  }

  function thumb(it) {
    const kind = previewKind(it)
    const box = document.createElement('span')
    box.className = 'thumb'
    box.dataset.kind = kind || 'file'
    if (kind === 'image' && !it.thumbFailed) {
      const img = document.createElement('img')
      img.alt = ''
      img.loading = 'lazy'
      img.decoding = 'async'
      img.src = imageUrl(it)
      img.addEventListener('load', () => box.classList.add('ready'), {once: true})
      img.addEventListener('error', () => {
        it.thumbFailed = true
        box.classList.add('ready')
        img.remove()
        box.textContent = fileExt(it.name) || 'img'
      }, {once: true})
      box.classList.add('skeleton')
      box.append(img)
    } else if (kind === 'video') box.innerHTML = ICONS.play
    else if (kind === 'audio') box.innerHTML = ICONS.music
    else box.textContent = kind === 'pdf' ? 'pdf' : fileExt(it.name) || 'file'
    return box
  }

  /** "12 MB" or "12 MB · Saved" under the file name. */
  function syncSaved(rec, it) {
    if (rec.saved === it.saved) return
    rec.saved = it.saved
    rec.sub.textContent = fmtSize(it.size)
    if (it.saved) {
      const ok = document.createElement('em')
      ok.className = 'saved'
      ok.textContent = t('saved')
      rec.sub.append(' · ', ok)
    }
  }

  function rowFor(it) {
    let rec = rows.get(it.id)
    if (!rec) {
      rec = row(it)
      rows.set(it.id, rec)
    }
    syncSaved(rec, it)
    return rec.li
  }

  function row(it) {
    const li = document.createElement('li')
    li.dataset.id = String(it.id)
    const kind = previewKind(it)
    const vis = thumb(it)
    if (kind) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'thumb-btn'
      b.setAttribute('aria-label', `${t('preview')}: ${it.name}`)
      b.append(vis)
      b.addEventListener('click', () => openPreview(it.id))
      li.append(b)
    } else li.append(vis)

    const meta = document.createElement('div')
    meta.className = 'meta'
    const name = document.createElement('b')
    name.textContent = it.name
    name.title = it.name
    const sub = document.createElement('span')
    sub.textContent = fmtSize(it.size)
    meta.append(name, sub)
    // the offer warned about it; say it again here, where the file is saved and opened
    if (isRisky(it.name)) {
      li.classList.add('risky')
      const warn = document.createElement('small')
      warn.className = 'risky-tag'
      warn.textContent = t('riskyTag')
      meta.append(warn)
    }

    const acts = document.createElement('div')
    acts.className = 'file-actions'
    if (kind) {
      const pv = document.createElement('button')
      pv.type = 'button'
      pv.className = 'btn small'
      pv.textContent = t('preview')
      pv.addEventListener('click', () => openPreview(it.id))
      acts.append(pv)
    }
    const save = document.createElement('a')
    save.className = 'btn small primary'
    save.href = urlOf(it)
    save.download = it.name
    save.textContent = t('save')
    save.addEventListener('click', () => markSaved(it))
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'icon-btn danger'
    del.innerHTML = ICONS.trash
    del.title = `${t('deleteFile')} ${it.name}`
    del.setAttribute('aria-label', del.title)
    del.addEventListener('click', () => removeOne(it.id))
    acts.append(save, del)
    li.append(meta, acts)
    return {li, sub, saved: false}
  }

  function render() {
    lastShownAt = Date.now()
    if (rowsLang !== lang) {
      // labels inside the rows are translated: rebuild them once after a language switch
      rowsLang = lang
      rows.clear()
    }
    const groups = ordered()
    list.replaceChildren(...groups.map(group => {
      const first = group[0]
      const sec = document.createElement('section')
      sec.className = 'inbox-group'
      sec.dataset.color = String(first.color)
      const h = document.createElement('h4')
      const dot = document.createElement('i')
      dot.setAttribute('aria-hidden', 'true')
      h.append(dot, t('fromAt', {name: first.from, time: timeOf(first.at)}))
      if (first.tid === highlightTid) {
        const badge = document.createElement('span')
        badge.className = 'new-badge'
        badge.textContent = t('newBadge')
        h.append(badge)
      }
      const ul = document.createElement('ul')
      ul.className = 'file-list'
      ul.append(...group.map(rowFor))
      sec.append(h, ul)
      return sec
    }))
    const total = bytes()
    $('#received-empty').hidden = items.length > 0
    $('#received-note').hidden = !items.length
    $('#received-note').textContent = t(total > BIG_INBOX ? 'inboxNoteBig' : 'inboxNote', {size: fmtSize(total)})
    $('#received-note').classList.toggle('warn', total > BIG_INBOX)
    $('#received-all').hidden = items.length < 2
    $('#received-clear').hidden = !items.length
  }

  function changed() {
    if (dlg.open) render()
    if (pdlg.open && current && items.includes(current)) {
      // files arrived while previewing: keep the counter and the strip in step
      const all = previewable()
      header(current, all)
      renderStrip(all)
    }
    onChange?.()
  }

  function markSaved(it) {
    if (it.saved) return
    it.saved = true
    // After the click has started the download: update just this row, then the counts.
    setTimeout(() => {
      const rec = rows.get(it.id)
      if (rec) syncSaved(rec, it)
      onChange?.()
    }, 0)
  }

  function drop(ids) {
    const gone = new Set(ids)
    for (const it of items) {
      if (!gone.has(it.id)) continue
      if (it.url) URL.revokeObjectURL(it.url)
      if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl)
      rows.delete(it.id)
    }
    items = items.filter(it => !gone.has(it.id))
    changed()
  }

  async function removeOne(id) {
    const it = items.find(x => x.id === id)
    if (!it) return
    // Always ask: deleting is the one thing in this list that can't be undone.
    const body = t(it.saved ? 'deleteBodySaved' : 'deleteBody')
    if (!(await confirmBox({title: t('deleteQ', {name: it.name}), body, ok: t('deleteFile')}))) return
    drop([id])
    // keep keyboard focus inside the dialog
    ;(list.querySelector('.file-actions .btn') || dlg.querySelector('[value="close"]'))?.focus()
  }

  async function clearAll() {
    if (!items.length) return false
    const u = unsaved()
    const vars = {n: items.length, size: fmtSize(bytes()), u}
    if (!(await confirmBox({title: t('clearQ'), body: t(u ? 'clearBody' : 'clearBodySaved', vars), ok: t('clearAll')}))) return false
    drop(items.map(it => it.id))
    toast?.(t('cleared'))
    return true
  }

  $('#received-clear').addEventListener('click', async () => {
    if (await clearAll()) dlg.close('cleared')
  })
  $('#received-all').addEventListener('click', async () => {
    for (const it of ordered().flat()) {
      const a = list.querySelector(`li[data-id="${it.id}"] a[download]`)
      if (!a) continue
      a.click()
      await new Promise(r => setTimeout(r, 400))
    }
  })

  // ---------- preview ----------
  //
  // A lightbox: the file fills most of the screen, arrows sit on its sides and a strip of
  // thumbnails runs underneath. The next file slides in only once it's decoded (no blank
  // flash in between), its neighbours are decoded ahead, and on touch screens you can swipe.

  const pdlg = $('#dlg-preview')
  const stage = $('#preview-stage')
  const strip = $('#preview-strip')
  const animated = effectsOn
  let current = null
  let slide = null // the slide on screen
  let waitTimer = 0 // puts a skeleton up if the first file takes a moment
  let seq = 0 // bumped by every show() and by closing: an older show() gives up
  let stripKey = ''

  /** Previewable files, in display order (what the arrows and the strip step through). */
  const previewable = () => ordered().flat().filter(it => previewKind(it))

  function dropSlide(el) {
    el.querySelectorAll('video, audio').forEach(m => m.pause())
    if (el._url) URL.revokeObjectURL(el._url)
    el.remove()
  }

  function clearStage() {
    clearTimeout(waitTimer)
    stage.querySelectorAll('.preview-slide, .preview-wait').forEach(dropSlide)
    slide = null
  }

  function newSlide(kind) {
    const s = document.createElement('div')
    s.className = 'preview-slide'
    s.dataset.kind = kind
    return s
  }

  function messageEl(text) {
    const p = document.createElement('p')
    p.className = 'preview-msg'
    p.textContent = text
    return p
  }

  const messageSlide = text => {
    const s = newSlide('none')
    s.append(messageEl(text))
    return s
  }

  /** A slide that turned out unreadable after it was shown. */
  const failIn = s => () => {
    if (!s.isConnected) return
    s.dataset.kind = 'none'
    s.replaceChildren(messageEl(t('previewFailed')))
  }

  function skeleton() {
    const sk = document.createElement('div')
    sk.className = 'skeleton preview-skeleton'
    return sk
  }

  /** The slide for a file; resolves when it's worth showing (an image is decoded). */
  async function build(it) {
    const kind = previewKind(it)
    if (!kind) return messageSlide(t('noPreview'))
    if (kind === 'pdf' && navigator.pdfViewerEnabled === false) return messageSlide(t('pdfNoViewer'))
    const s = newSlide(kind)

    if (kind === 'text') {
      let text
      try {
        text = await it.blob.slice(0, TEXT_PREVIEW_BYTES).text()
      } catch {
        return messageSlide(t('previewFailed'))
      }
      const pre = document.createElement('pre')
      pre.textContent = it.size > TEXT_PREVIEW_BYTES ? `${text}\n${t('textCut')}` : text
      s.append(pre)
      return s
    }

    if (kind === 'image') {
      const img = document.createElement('img')
      img.alt = it.name
      img.decoding = 'async'
      img.draggable = false
      img.src = imageUrl(it)
      // Hold the current file until this one is decoded, but not for long: a huge photo
      // shows a skeleton instead of making the arrows feel stuck.
      const ok = await Promise.race([img.decode().then(() => true, () => false), wait(DECODE_WAIT_MS)])
      if (ok === false) return messageSlide(t('previewFailed'))
      if (!ok) {
        const sk = skeleton()
        s.append(sk)
        if (img.complete && img.naturalWidth) sk.remove()
        else {
          img.addEventListener('load', () => sk.remove(), {once: true})
          img.addEventListener('error', failIn(s), {once: true})
        }
      }
      s.append(img)
      return s
    }

    // video, audio, PDF: their own URL with the type we chose, freed with the slide
    s._url = URL.createObjectURL(new Blob([it.blob], {type: previewType(kind, it)}))
    const sk = skeleton()
    s.append(sk)
    let el
    if (kind === 'video' || kind === 'audio') {
      el = document.createElement(kind)
      el.controls = true
      el.preload = 'metadata'
      if (kind === 'video') el.playsInline = true
      el.addEventListener('loadedmetadata', () => sk.remove(), {once: true})
      if (kind === 'audio') {
        const art = document.createElement('div')
        art.className = 'audio-art'
        art.innerHTML = ICONS.music
        s.append(art)
      }
    } else {
      el = document.createElement('iframe')
      el.title = it.name
      el.addEventListener('load', () => sk.remove(), {once: true})
    }
    el.addEventListener('error', failIn(s), {once: true})
    el.src = s._url
    s.append(el)
    return s
  }

  // the new slide comes in from the side we're heading to; the old one leaves the other way
  const EASE_IN = 'cubic-bezier(.2,.8,.2,1)'
  function enter(el, dir) {
    if (!animated()) return
    const from = dir ? `translateX(${dir * 14}%)` : 'scale(0.98)'
    el.animate([{transform: from, opacity: 0}, {transform: 'none', opacity: 1}], {duration: SLIDE_MS, easing: EASE_IN})
  }
  function leave(el, dir, fromX = 0) {
    el.classList.add('leaving')
    el.querySelectorAll('video, audio').forEach(m => m.pause())
    const fromOpacity = Number(el.style.opacity || 1)
    el.style.transform = el.style.opacity = ''
    if (!animated() || !dir) return dropSlide(el)
    const a = el.animate([
      {transform: `translateX(${fromX}px)`, opacity: fromOpacity},
      {transform: `translateX(calc(${fromX}px + ${-dir * 14}%))`, opacity: 0},
    ], {duration: SLIDE_MS * 0.8, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards'})
    a.finished.then(() => dropSlide(el), () => dropSlide(el))
  }

  function header(it, all) {
    const name = $('#preview-name')
    name.textContent = it.name
    name.title = it.name
    $('#preview-meta').textContent = `${fmtSize(it.size)} · ${t('fromAt', {name: it.from, time: timeOf(it.at)})}`
    $('#preview-pos').textContent = all.length > 1 ? `${all.indexOf(it) + 1} / ${all.length}` : ''
    $('#preview-prev').hidden = $('#preview-next').hidden = all.length < 2
    const save = $('#preview-save')
    save.href = urlOf(it)
    save.download = it.name
    save.onclick = () => markSaved(it)
  }

  /** The thumbnail strip: built once per set of files, then only the highlight moves. */
  function renderStrip(all) {
    strip.hidden = all.length < 2
    const key = strip.hidden ? '' : all.map(x => x.id).join(',')
    if (key !== stripKey) {
      stripKey = key
      strip.replaceChildren(...(key ? all.map(it => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'strip-item'
        b.dataset.id = String(it.id)
        b.title = it.name
        b.setAttribute('aria-label', it.name)
        b.append(thumb(it))
        b.addEventListener('click', () => goTo(it))
        return b
      }) : []))
    }
    for (const b of strip.children) {
      const on = current && b.dataset.id === String(current.id)
      b.classList.toggle('active', !!on)
      if (on) b.setAttribute('aria-current', 'true')
      else b.removeAttribute('aria-current')
    }
    centreStrip()
  }

  function centreStrip() {
    const b = strip.querySelector('.active')
    if (!b || !pdlg.open) return
    const left = b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2
    strip.scrollTo({left, behavior: animated() ? 'smooth' : 'auto'})
  }

  /**
   * Decode the next file in the direction we're going, so the next arrow press is instant.
   * One file only, and not a huge one, so a phone never holds several big bitmaps at once.
   */
  function preloadNext(it, all, dir) {
    const i = all.indexOf(it)
    const n = all[(i + (dir || 1) + all.length) % all.length]
    if (!n || n === it || previewKind(n) !== 'image' || n.thumbFailed || n.size > PRELOAD_MAX_BYTES) return
    const im = new Image()
    im.src = imageUrl(n)
    im.decode().catch(() => {})
  }

  async function show(it, dir = 0, fromX = 0) {
    const token = ++seq
    current = it
    const all = previewable()
    header(it, all)
    renderStrip(all)
    if (!slide) {
      // nothing on screen yet (just opened): a skeleton if the file isn't ready in a blink
      clearTimeout(waitTimer)
      waitTimer = setTimeout(() => {
        if (token !== seq || slide || stage.querySelector('.preview-wait')) return
        const sk = skeleton()
        sk.classList.add('preview-wait')
        stage.prepend(sk)
      }, 120)
    }
    const next = await build(it)
    if (token !== seq) return dropSlide(next) // another file was picked (or closed) meanwhile
    clearTimeout(waitTimer)
    stage.querySelector('.preview-wait')?.remove()
    const old = slide
    slide = next
    stage.prepend(next) // under the arrows
    if (old) leave(old, dir, fromX)
    enter(next, old ? dir : 0)
    preloadNext(it, all, dir)
  }

  function step(dir, fromX = 0) {
    const all = previewable()
    if (all.length < 2 || !current) return
    const i = all.indexOf(current)
    show(all[(i + dir + all.length) % all.length], dir, fromX)
  }

  function goTo(it) {
    if (it === current) return
    const all = previewable()
    show(it, all.indexOf(it) > all.indexOf(current) ? 1 : -1)
  }

  $('#preview-prev').addEventListener('click', () => step(-1))
  $('#preview-next').addEventListener('click', () => step(1))
  pdlg.addEventListener('keydown', e => {
    if (e.target.closest('video, audio')) return
    if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  })

  // swipe left / right on touch screens (a mouse uses the arrows). While the page is pinch-
  // zoomed, a sideways drag pans the photo instead: no swiping, and the stage hands panning
  // back to the browser (CSS: .preview-stage.zoomed).
  let drag = null
  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01
  window.visualViewport?.addEventListener('resize', () => {
    if (pdlg.open) stage.classList.toggle('zoomed', zoomed())
  })

  function snapBack() {
    const el = slide
    if (!el) return
    const from = el.style.transform
    el.style.transform = el.style.opacity = ''
    if (from && animated()) el.animate([{transform: from}, {transform: 'none'}], {duration: 220, easing: EASE_IN})
  }

  stage.addEventListener('pointerdown', e => {
    if (drag) {
      // a second finger: that's a pinch, not a swipe
      if (e.pointerId !== drag.id) {
        drag = null
        snapBack()
      }
      return
    }
    if (e.pointerType === 'mouse' || !slide || zoomed()) return
    if (e.target.closest('.preview-nav, video, audio, iframe, pre') || previewable().length < 2) return
    drag = {id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp, dx: 0, live: false}
  })
  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    if (!drag.live) {
      if (Math.abs(dx) < 10) return
      if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) return void (drag = null) // scrolling
      drag.live = true
      try { stage.setPointerCapture(e.pointerId) } catch {}
      // still sliding in from the last swipe: stop that, so the photo follows the finger now
      slide.getAnimations().forEach(a => a.finish())
    }
    drag.dx = dx
    slide.style.transform = `translateX(${dx}px)`
    slide.style.opacity = String(1 - Math.min(0.4, Math.abs(dx) / (stage.clientWidth || 1)))
  })
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return
    const {dx, live, at} = drag
    drag = null
    if (!live || !slide) return
    const flick = Math.abs(dx) / Math.max(1, e.timeStamp - at) > 0.45
    if (e.type === 'pointerup' && (Math.abs(dx) > stage.clientWidth * 0.18 || (flick && Math.abs(dx) > 30))) {
      step(dx < 0 ? 1 : -1, dx)
      return
    }
    snapBack()
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)

  pdlg.addEventListener('close', () => {
    seq++
    clearStage()
    stage.classList.remove('zoomed')
    current = null
    drag = null
    stripKey = ''
    strip.replaceChildren()
    if (dlg.open) render() // "Saved" may have changed
  })

  function openPreview(id) {
    const it = items.find(x => x.id === id)
    if (!it) return
    if (!pdlg.open) showDialog(pdlg)
    stage.classList.toggle('zoomed', zoomed())
    show(it)
  }

  return {
    /** Files that just arrived from one transfer. */
    add(tid, {from, color}, results) {
      const at = Date.now()
      for (const r of results) {
        if (!r) continue
        items.push({id: nextId++, tid, from, color, name: r.name, type: r.type || r.blob.type, size: r.size, blob: r.blob, url: null, saved: false, at})
      }
      changed()
    },
    has: tid => items.some(it => it.tid === tid),
    /** Has the list been on screen since these files arrived? */
    seen: tid => items.some(it => it.tid === tid && it.at <= lastShownAt),
    get count() { return items.length },
    get bytes() { return bytes() },
    get unsaved() { return unsaved() },
    /** Open the list; resolves when it's closed. */
    async open({title = t('inbox'), highlight = null} = {}) {
      highlightTid = highlight
      $('#received-title').textContent = title
      render()
      if (dlg.open) return
      await showDialog(dlg)
      highlightTid = null
    },
    isOpen: () => dlg.open,
    render: () => dlg.open && render(),
  }
}
