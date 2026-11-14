// Who a device "looks like": a space mascot (see ui/avatars.js) and one of 8 pastel colours.
// New devices get a random space name ("Sleepy Saturn") whose noun picks the mascot, and a
// colour from a hash of the device id — a stable, distinct look without asking anything.
// The user can change all of it in their profile.

/** Mascot ids, in the order shown in the profile picker. */
export const AVATARS = [
  'saturn', 'moon', 'star', 'comet', 'sun', 'rocket', 'saucer', 'satellite',
  'astro', 'alien', 'planet', 'asteroid', 'nebula', 'galaxy', 'luna', 'rover',
]

/** Name noun -> mascot. */
const NOUNS = {
  Saturn: 'saturn', Moon: 'moon', Star: 'star', Comet: 'comet', Sun: 'sun', Rocket: 'rocket',
  Saucer: 'saucer', Satellite: 'satellite', Astro: 'astro', Alien: 'alien', Planet: 'planet',
  Asteroid: 'asteroid', Nebula: 'nebula', Galaxy: 'galaxy', Luna: 'luna', Rover: 'rover',
}
const ADJECTIVES = ['Sleepy', 'Tiny', 'Brave', 'Cosmic', 'Lucky', 'Sunny', 'Dreamy', 'Bouncy', 'Sparkly', 'Cozy', 'Swift', 'Jolly', 'Misty', 'Gentle', 'Clever', 'Happy']

export function randomName() {
  const pick = list => list[Math.floor(Math.random() * list.length)]
  return `${pick(ADJECTIVES)} ${pick(Object.keys(NOUNS))}`
}

// Names the previous version generated ("Swift Turtle"). A device still using one of these
// never chose its name, so it can be moved to the space naming scheme.
const OLD_ADJ = ['Blue', 'Swift', 'Sunny', 'Quiet', 'Brave', 'Lucky', 'Cosmic', 'Mellow', 'Bright', 'Jolly', 'Misty', 'Rapid', 'Gentle', 'Clever', 'Happy', 'Snowy']
const OLD_ANIMALS = ['Otter', 'Panda', 'Fox', 'Koala', 'Falcon', 'Tiger', 'Dolphin', 'Owl', 'Rabbit', 'Penguin', 'Lynx', 'Gecko', 'Whale', 'Heron', 'Turtle', 'Elephant']

export function isOldGeneratedName(name) {
  const [adj, animal, ...rest] = String(name || '').trim().split(/\s+/)
  return !rest.length && OLD_ADJ.includes(adj) && OLD_ANIMALS.includes(animal)
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
  const noun = String(name || '').trim().split(/\s+/).pop()
  return NOUNS[noun] || AVATARS[hashIndex(deviceId || name, AVATARS.length)]
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

/** Fill in avatar/colour for a peer that didn't send valid ones (e.g. older versions sent emoji). */
export function withLook(info) {
  return {
    ...info,
    avatar: cleanAvatar(info.avatar) || defaultAvatar(info.name, info.deviceId),
    color: cleanColor(info.color) ?? defaultColor(info.deviceId, info.name),
  }
}
