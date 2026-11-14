// Saved pairings. Each pairing is a shared secret both devices keep; it names a private
// room they both join on every launch, so they find each other on any network.

import {pairIdOf} from './net.js'

const KEY = 'nearby.pairs'

export function loadPairs() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter(p => p && typeof p.secret === 'string' && typeof p.id === 'string') : []
  } catch {
    return []
  }
}

function savePairs(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch {}
}

/** Store a pairing (replacing an older one with the same device). Returns the record. */
export async function addPair({secret, name, deviceId}) {
  const id = await pairIdOf(secret)
  const record = {id, secret, name: name || '?', deviceId: deviceId || '', created: Date.now()}
  const list = loadPairs().filter(p => p.id !== id && (!deviceId || p.deviceId !== deviceId))
  list.push(record)
  savePairs(list)
  return record
}

export function removePair(id) {
  const list = loadPairs()
  const record = list.find(p => p.id === id) || null
  savePairs(list.filter(p => p.id !== id))
  return record
}

/** Keep the stored name/device id fresh when the paired device says hello. */
export function touchPair(id, {name, deviceId}) {
  const list = loadPairs()
  const p = list.find(x => x.id === id)
  if (!p) return
  let changed = false
  if (name && p.name !== name) { p.name = name; changed = true }
  if (deviceId && !p.deviceId) { p.deviceId = deviceId; changed = true }
  if (changed) savePairs(list)
}
