// System notifications, vibration and the app-icon badge.
//
// Notifications only work while Nearby is open somewhere (a background tab or a minimised
// window is fine): without a push server nothing can wake a closed app. They are shown
// only when the user isn't looking at the page, since the page has its own toasts.

const KEY = 'nearby.notify'

function read() {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function write(v) {
  try { localStorage.setItem(KEY, v) } catch {}
}

export function notifySupported() {
  return typeof Notification === 'function'
}

/** 'on' | 'off' | 'blocked' | 'unsupported' */
export function notifyState() {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return read() === 'on' && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Must be called from a click. Returns the new state. */
export async function toggleNotify() {
  if (notifyState() === 'on') {
    write('off')
    return 'off'
  }
  if (!notifySupported()) return 'unsupported'
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission === 'granted') write('on')
  return notifyState()
}

const userIsAway = () => document.hidden || !document.hasFocus()

const iconUrl = () => new URL('icons/icon-192.png', location.href).href

/**
 * Show a system notification if enabled and the user is away.
 * actions: [{action, title}] — shown by Chrome / Edge / Android; clicks come back
 * through onNotificationAction().
 */
export async function notify({title, body = '', tag, actions = [], data = {}}) {
  if (notifyState() !== 'on' || !userIsAway()) return false
  const options = {body, tag, data, icon: iconUrl(), badge: iconUrl(), renotify: !!tag, actions}
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
  } catch {}
  try {
    const n = new Notification(title, {body, tag, icon: iconUrl()})
    n.onclick = () => {
      window.focus()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

export async function closeNotification(tag) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const list = (await reg?.getNotifications({tag})) || []
    list.forEach(n => n.close())
  } catch {}
}

/** Notification button presses (and plain clicks) relayed by the service worker. */
export function onNotificationAction(callback) {
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'nearby-notification') callback(event.data)
  })
}

export function buzz(pattern = [70, 50, 70]) {
  // Chrome refuses (and logs an error) until the user has tapped the page at least once.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try { navigator.vibrate?.(pattern) } catch {}
}

// ---------- app icon badge (installed app) ----------

let badge = 0

function applyBadge() {
  try {
    if (badge > 0) navigator.setAppBadge?.(badge)?.catch?.(() => {})
    else navigator.clearAppBadge?.()?.catch?.(() => {})
  } catch {}
}

/** Count something that happened while the user was away. */
export function bumpBadge() {
  if (!userIsAway()) return
  badge++
  applyBadge()
}

export function clearBadge() {
  badge = 0
  applyBadge()
}
