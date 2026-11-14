// Decorative effects switch + power-saving mode.
//
// Setting (profile): 'auto' (default) | 'saver' | 'full'.
// In auto, power saving turns on for low-end devices (≤ 2 CPU cores or ≤ 2 GB RAM) and when
// the battery is at 20% or less and not charging. Power saving adds class "lite" to <html>,
// which CSS uses to stop purely decorative animation; effectsOn() tells JS the same, and also
// respects the system "reduce motion" setting.

const KEY = 'nearby.power'
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const weakDevice = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) ||
  (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2)
let lowBattery = false
const listeners = new Set()

export function powerSetting() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'saver' || v === 'full' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function isLite() {
  const s = powerSetting()
  return s === 'saver' || (s === 'auto' && (weakDevice || lowBattery))
}

/** Why auto mode is saving power right now: 'battery' | 'device' | null. */
export function liteReason() {
  if (powerSetting() !== 'auto') return null
  return lowBattery ? 'battery' : weakDevice ? 'device' : null
}

/** Should decorative effects run? */
export function effectsOn() {
  return !isLite() && !reduceMotion.matches
}

function apply() {
  document.documentElement.classList.toggle('lite', isLite())
  listeners.forEach(fn => fn())
}

export function setPowerSetting(value) {
  try { localStorage.setItem(KEY, value) } catch {}
  apply()
}

export function onPowerChange(fn) {
  listeners.add(fn)
}

reduceMotion.addEventListener('change', apply)

navigator.getBattery?.().then(battery => {
  const update = () => {
    const next = !battery.charging && battery.level <= 0.2
    if (next !== lowBattery) {
      lowBattery = next
      apply()
    }
  }
  battery.addEventListener('levelchange', update)
  battery.addEventListener('chargingchange', update)
  update()
}).catch(() => {})

apply()
