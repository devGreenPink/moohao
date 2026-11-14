// Received files: everything that arrived into memory stays here (in this page only) until
// the user saves, deletes or clears it, or closes the page. Also the preview viewer for
// images, video, audio, PDF and plain text.
//
// Safety: received files come from another device, so a preview never renders a file as a
// page. Each preview gets its own Blob whose type we choose from the kind we detected
// (image/video/audio/PDF), text is shown with textContent, and anything else isn't shown.

import {t, lang} from '../i18n.js'
import {ICONS} from './mascot.js'
import {fmtSize, fileExt} from './transfers.js'

const $ = sel => document.querySelector(sel)

/** Above this much held in memory, the note turns into a gentle warning. */
const BIG_INBOX = 1024 ** 3
const TEXT_PREVIEW_BYTES = 200 * 1024

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
      // One URL per file, kept with the file and revoked when it's deleted, so a thumbnail
      // that never loads (off-screen, lazy) can't leave the image pinned in memory.
      img.src = it.thumbUrl ??= URL.createObjectURL(new Blob([it.blob], {type: previewType('image', it)}))
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

  const pdlg = $('#dlg-preview')
  const stage = $('#preview-stage')
  let current = null
  let previewUrl = null

  function clearStage() {
    stage.querySelectorAll('video, audio').forEach(m => m.pause())
    stage.replaceChildren()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }

  function message(text) {
    const p = document.createElement('p')
    p.className = 'preview-msg'
    p.textContent = text
    stage.replaceChildren(p)
    stage.dataset.kind = 'none'
  }

  /** Previewable files, in display order (what the arrows step through). */
  const previewable = () => ordered().flat().filter(it => previewKind(it))

  async function show(it) {
    clearStage()
    current = it
    const all = previewable()
    const i = all.indexOf(it)
    $('#preview-name').textContent = it.name
    $('#preview-meta').textContent = `${fmtSize(it.size)} · ${t('fromAt', {name: it.from, time: timeOf(it.at)})}`
    $('#preview-pos').textContent = all.length > 1 ? `${i + 1} / ${all.length}` : ''
    $('#preview-prev').hidden = $('#preview-next').hidden = all.length < 2
    const save = $('#preview-save')
    save.href = urlOf(it)
    save.download = it.name
    save.onclick = () => markSaved(it)

    const kind = previewKind(it)
    stage.dataset.kind = kind || 'none'
    if (!kind) return message(t('noPreview'))
    if (kind === 'pdf' && navigator.pdfViewerEnabled === false) return message(t('pdfNoViewer'))

    const sk = document.createElement('div')
    sk.className = 'skeleton preview-skeleton'
    stage.append(sk)
    const ready = () => sk.remove()
    const fail = () => current === it && message(t('previewFailed'))

    if (kind === 'text') {
      let text = ''
      try {
        text = await it.blob.slice(0, TEXT_PREVIEW_BYTES).text()
      } catch {
        return fail()
      }
      if (current !== it) return
      const pre = document.createElement('pre')
      pre.textContent = it.size > TEXT_PREVIEW_BYTES ? `${text}\n${t('textCut')}` : text
      stage.replaceChildren(pre)
      return
    }

    previewUrl = URL.createObjectURL(new Blob([it.blob], {type: previewType(kind, it)}))
    let el
    if (kind === 'image') {
      el = document.createElement('img')
      el.alt = it.name
      el.addEventListener('load', ready, {once: true})
    } else if (kind === 'video' || kind === 'audio') {
      el = document.createElement(kind)
      el.controls = true
      el.preload = 'metadata'
      if (kind === 'video') el.playsInline = true
      el.addEventListener('loadedmetadata', ready, {once: true})
      if (kind === 'audio') {
        const art = document.createElement('div')
        art.className = 'audio-art'
        art.innerHTML = ICONS.music
        stage.append(art)
      }
    } else {
      el = document.createElement('iframe')
      el.title = it.name
      el.addEventListener('load', ready, {once: true})
    }
    el.addEventListener('error', fail, {once: true})
    el.src = previewUrl
    stage.append(el)
  }

  function step(dir) {
    const all = previewable()
    if (all.length < 2 || !current) return
    const i = all.indexOf(current)
    show(all[(i + dir + all.length) % all.length])
  }

  $('#preview-prev').addEventListener('click', () => step(-1))
  $('#preview-next').addEventListener('click', () => step(1))
  pdlg.addEventListener('keydown', e => {
    if (e.target.closest('video, audio')) return
    if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  })
  pdlg.addEventListener('close', () => {
    clearStage()
    current = null
    if (dlg.open) render() // "Saved" may have changed
  })

  function openPreview(id) {
    const it = items.find(x => x.id === id)
    if (!it) return
    show(it)
    if (!pdlg.open) showDialog(pdlg)
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
