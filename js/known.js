// Devices this browser has met before, kept only on this device (localStorage).
// Used for "new / seen before" badges, radar placement, the "last connected" line,
// transfer counts, and nicknames the user gives other devices.

const KEY = 'nearby.known'
const MAX_DEVICES = 200
const sessionStart = Date.now()

let cache = null
let saveTimer = 0

function load() {
  if (cache) return cache
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}')
    cache = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    cache = {}
  }
  return cache
}

function save(now = false) {
  clearTimeout(saveTimer)
  const write = () => {
    const entries = Object.entries(load())
    if (entries.length > MAX_DEVICES) {
      entries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0))
      cache = Object.fromEntries(entries.slice(0, MAX_DEVICES))
    }
    try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch {}
  }
  if (now) write()
  else saveTimer = setTimeout(write, 800)
}

window.addEventListener('storage', e => {
  if (e.key === KEY) cache = null
})

export function knownDevice(deviceId) {
  return (deviceId && load()[deviceId]) || null
}

/** Record that a device is here now. Returns its record (or null without a device id). */
export function noteSeen(info) {
  if (!info.deviceId) return null
  const all = load()
  const now = Date.now()
  const rec = all[info.deviceId] || (all[info.deviceId] = {firstSeen: now, sent: 0, received: 0})
  // Remember when it was last seen *before* this visit, for "last connected 2 days ago".
  // (Only the first sighting in a visit has lastSeen from before it.)
  if (rec.lastSeen && rec.lastSeen < sessionStart) rec.prevSeen = rec.lastSeen
  rec.lastSeen = now
  rec.name = info.name
  rec.avatar = info.avatar
  rec.color = info.color
  rec.device = info.device
  save()
  return rec
}

export function noteTransfer(deviceId, dir) {
  const rec = knownDevice(deviceId)
  if (!rec) return
  if (dir === 'out') rec.sent = (rec.sent || 0) + 1
  else rec.received = (rec.received || 0) + 1
  rec.lastTransfer = Date.now()
  save()
}

export function setNickname(deviceId, nickname) {
  const rec = knownDevice(deviceId)
  if (!rec) return
  const clean = String(nickname || '').trim().slice(0, 40)
  if (clean) rec.nickname = clean
  else delete rec.nickname
  save(true)
}

/** 'known' if we met this device before this visit, else 'new'. */
export function familiarity(deviceId) {
  const rec = knownDevice(deviceId)
  return rec && rec.firstSeen < sessionStart ? 'known' : 'new'
}

/** The name to show: the user's nickname for the device, or the device's own name. */
export function displayName(info) {
  return knownDevice(info.deviceId)?.nickname || info.name
}
