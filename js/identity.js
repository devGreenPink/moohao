// Who a device "looks like": an animal avatar and one of 8 pastel colours. Defaults come
// from the device name ("Swift Turtle" -> 🐢) and a hash of its id, so every device gets a
// stable, distinct look without asking; the user can change both in their profile.

export const AVATARS = [
  '🦦', '🐼', '🦊', '🐨', '🦅', '🐯', '🐬', '🦉',
  '🐰', '🐧', '🐆', '🦎', '🐳', '🦩', '🐢', '🐘',
  '🐱', '🐶', '🐹', '🦁', '🐸', '🐵', '🐙', '🦄',
]

const ANIMAL_AVATAR = {
  Otter: '🦦', Panda: '🐼', Fox: '🦊', Koala: '🐨', Falcon: '🦅', Tiger: '🐯', Dolphin: '🐬', Owl: '🦉',
  Rabbit: '🐰', Penguin: '🐧', Lynx: '🐆', Gecko: '🦎', Whale: '🐳', Heron: '🦩', Turtle: '🐢', Elephant: '🐘',
}

/** Number of colour slots; the actual colours live in style.css ([data-color="n"]). */
export const COLOR_COUNT = 8

export function hashIndex(text, n) {
  let h = 0x811c9dc5
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0) % n
}

export function defaultAvatar(name, deviceId) {
  const animal = String(name || '').trim().split(/\s+/).pop()
  return ANIMAL_AVATAR[animal] || AVATARS[hashIndex(deviceId || name, AVATARS.length)]
}

export function defaultColor(deviceId, name) {
  return hashIndex(deviceId || name, COLOR_COUNT)
}

export function cleanAvatar(value) {
  return AVATARS.includes(value) ? value : null
}

export function cleanColor(value) {
  return Number.isInteger(value) && value >= 0 && value < COLOR_COUNT ? value : null
}

/** Fill in avatar/colour for a peer that didn't send them (older versions). */
export function withLook(info) {
  return {
    ...info,
    avatar: cleanAvatar(info.avatar) || defaultAvatar(info.name, info.deviceId),
    color: cleanColor(info.color) ?? defaultColor(info.deviceId, info.name),
  }
}
