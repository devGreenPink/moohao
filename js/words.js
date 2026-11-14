// Room codes made of 3 everyday words, e.g. "cat-orange-star" / "แมว · ส้ม · ดาว".
// Each word slot has an English and a Thai form; both map to the same room, so people
// can read the code aloud in either language. 128^3 ≈ 2.1 million codes.
//
// Words were picked to be easy to say and to avoid near-homophones (e.g. ขาว/ข้าว,
// เทา/เต่า, กล่อง/กลอง) and words that are just two other words glued together.

const WORDS = [
  // animals
  ['cat', 'แมว'], ['dog', 'หมา', 'สุนัข'], ['fish', 'ปลา'], ['bird', 'นก'], ['duck', 'เป็ด'],
  ['chicken', 'ไก่'], ['frog', 'กบ'], ['turtle', 'เต่า'], ['rabbit', 'กระต่าย'], ['tiger', 'เสือ'],
  ['lion', 'สิงโต'], ['bear', 'หมี'], ['panda', 'แพนด้า'], ['elephant', 'ช้าง'], ['horse', 'ม้า'],
  ['cow', 'วัว'], ['pig', 'หมู'], ['goat', 'แพะ'], ['sheep', 'แกะ'], ['monkey', 'ลิง'],
  ['snake', 'งู'], ['shark', 'ฉลาม'], ['whale', 'วาฬ', 'ปลาวาฬ'], ['crab', 'ปู'], ['shrimp', 'กุ้ง'],
  ['squid', 'หมึก'], ['owl', 'นกฮูก'], ['bee', 'ผึ้ง'], ['ant', 'มด'], ['butterfly', 'ผีเสื้อ'],
  ['deer', 'กวาง'], ['mouse', 'หนู'], ['penguin', 'เพนกวิน'], ['dragon', 'มังกร'], ['shell', 'หอย'],
  // food
  ['apple', 'แอปเปิล', 'แอปเปิ้ล'], ['banana', 'กล้วย'], ['mango', 'มะม่วง'], ['orange', 'ส้ม'],
  ['grape', 'องุ่น'], ['melon', 'แตงโม'], ['coconut', 'มะพร้าว'], ['durian', 'ทุเรียน'],
  ['papaya', 'มะละกอ'], ['lemon', 'มะนาว'], ['pineapple', 'สับปะรด'], ['cherry', 'เชอร์รี'],
  ['peach', 'พีช'], ['rice', 'ข้าว'], ['soup', 'ซุป'], ['egg', 'ไข่'], ['bread', 'ขนมปัง'],
  ['cake', 'เค้ก'], ['candy', 'ลูกอม'], ['tea', 'ชา'], ['coffee', 'กาแฟ'], ['milk', 'นม'],
  ['cookie', 'คุกกี้'], ['corn', 'ข้าวโพด'], ['pumpkin', 'ฟักทอง'], ['carrot', 'แครอท'],
  ['tomato', 'มะเขือเทศ'], ['bamboo', 'ไผ่'], ['pearl', 'ไข่มุก'],
  // colours
  ['red', 'แดง'], ['blue', 'ฟ้า'], ['green', 'เขียว'], ['yellow', 'เหลือง'], ['pink', 'ชมพู'],
  ['purple', 'ม่วง'], ['black', 'ดำ'], ['gold', 'ทอง'], ['silver', 'เงิน'],
  // nature
  ['sun', 'ตะวัน'], ['moon', 'จันทร์', 'พระจันทร์'], ['star', 'ดาว'], ['cloud', 'เมฆ'], ['rain', 'ฝน'],
  ['snow', 'หิมะ'], ['wind', 'ลม'], ['sea', 'ทะเล'], ['river', 'แม่น้ำ'], ['mountain', 'ภูเขา'],
  ['forest', 'ป่า'], ['tree', 'ต้นไม้'], ['flower', 'ดอกไม้'], ['leaf', 'ใบไม้'], ['rock', 'หิน'],
  ['sand', 'ทราย'], ['island', 'เกาะ'], ['lake', 'ทะเลสาบ'], ['rainbow', 'รุ้ง'], ['fire', 'ไฟ'],
  ['ice', 'น้ำแข็ง'], ['cactus', 'กระบองเพชร'],
  // things
  ['book', 'หนังสือ'], ['pen', 'ปากกา'], ['bag', 'กระเป๋า'], ['hat', 'หมวก'], ['shoe', 'รองเท้า'],
  ['key', 'กุญแจ'], ['door', 'ประตู'], ['window', 'หน้าต่าง'], ['chair', 'เก้าอี้'], ['table', 'โต๊ะ'],
  ['bed', 'เตียง'], ['clock', 'นาฬิกา'], ['phone', 'โทรศัพท์'], ['car', 'รถ'], ['boat', 'เรือ'],
  ['plane', 'เครื่องบิน'], ['bike', 'จักรยาน'], ['ball', 'ลูกบอล'], ['kite', 'ว่าว'], ['drum', 'กลอง'],
  ['guitar', 'กีตาร์'], ['bell', 'ระฆัง'], ['cup', 'แก้ว'], ['spoon', 'ช้อน'], ['umbrella', 'ร่ม'],
  ['gift', 'ของขวัญ'], ['robot', 'หุ่นยนต์'], ['rocket', 'จรวด'], ['crown', 'มงกุฎ'],
  ['candle', 'เทียน'], ['map', 'แผนที่'], ['house', 'บ้าน'], ['tent', 'เต็นท์'],
]

if (WORDS.length !== 128) throw new Error(`word list must have 128 entries, has ${WORDS.length}`)

const LOOKUP = new Map()
WORDS.forEach((forms, i) => forms.forEach(f => LOOKUP.set(f.toLowerCase(), i)))
// Longest first, for splitting Thai typed without spaces.
const BY_LENGTH = [...LOOKUP.keys()].sort((a, b) => b.length - a.length)

const LEGACY = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

// ---------- picture codes: 4 space mascots, tapped instead of typed ----------
// e.g. "p-saturn-rocket-alien-moon". 16^4 = 65,536 codes: plenty for short-lived rooms,
// since files still need the receiver's "Accept" and the safety code shows who is who.

/**
 * Mascot id → [English, Thai] name (said aloud), and a fixed colour so every screen matches.
 * The round ones (moon, planet, asteroid, sun, saturn, galaxy) all get different colours so
 * they can't be mixed up at a glance.
 */
export const PICTURES = {
  saturn: ['Saturn', 'ดาวเสาร์', 0],
  moon: ['Moon', 'พระจันทร์', 1],
  star: ['Star', 'ดาว', 4],
  comet: ['Comet', 'ดาวหาง', 2],
  sun: ['Sun', 'ดวงอาทิตย์', 5],
  rocket: ['Rocket', 'จรวด', 7],
  saucer: ['UFO', 'จานบิน', 6],
  satellite: ['Satellite', 'ดาวเทียม', 2],
  astro: ['Astronaut', 'นักบินอวกาศ', 0],
  alien: ['Alien', 'เอเลี่ยน', 3],
  planet: ['Planet', 'ดาวเคราะห์', 7],
  asteroid: ['Asteroid', 'อุกกาบาต', 3],
  nebula: ['Nebula', 'เนบิวลา', 1],
  galaxy: ['Galaxy', 'กาแล็กซี', 6],
  luna: ['Crescent', 'จันทร์เสี้ยว', 4],
  rover: ['Rover', 'รถสำรวจ', 5],
}
export const PICTURE_IDS = Object.keys(PICTURES)
export const PICTURE_LENGTH = 4

export function isPictureCode(code) {
  if (typeof code !== 'string' || !code.startsWith('p-')) return false
  const ids = code.slice(2).split('-')
  return ids.length === PICTURE_LENGTH && ids.every(id => id in PICTURES)
}

/** Mascot ids of a picture code. */
export function pictureIds(code) {
  return isPictureCode(code) ? code.slice(2).split('-') : []
}

export function pictureCode(ids) {
  return `p-${ids.join('-')}`
}

export function newPictureCode() {
  const r = crypto.getRandomValues(new Uint8Array(PICTURE_LENGTH))
  return pictureCode([...r].map(b => PICTURE_IDS[b & 15]))
}

export function newWordCode() {
  const r = crypto.getRandomValues(new Uint8Array(3))
  return [...r].map(b => WORDS[b & 127][0]).join('-')
}

function segment(text, need = 3) {
  if (!text) return need === 0 ? [] : null
  if (need === 0) return null
  for (const w of BY_LENGTH) {
    if (text.startsWith(w)) {
      const rest = segment(text.slice(w.length), need - 1)
      if (rest) return [LOOKUP.get(w), ...rest]
    }
  }
  return null
}

/**
 * Turn whatever the user typed or scanned into a canonical room code, or null.
 * Accepts "cat-orange-star", "Cat Orange Star", "แมว ส้ม ดาว", "แมวส้มดาว",
 * mixed languages, and the older 6-character codes (e.g. "6HSRG2").
 */
export function parseRoomCode(raw) {
  const s = String(raw || '').normalize('NFC').trim().toLowerCase()
  if (!s) return null
  if (isPictureCode(s)) return s
  const tokens = s.split(/[\s\-_,.·/|+]+/).filter(Boolean)
  if (tokens.length === 3 && tokens.every(tk => LOOKUP.has(tk))) {
    return tokens.map(tk => WORDS[LOOKUP.get(tk)][0]).join('-')
  }
  const joined = tokens.join('')
  const parts = segment(joined)
  if (parts) return parts.map(i => WORDS[i][0]).join('-')
  const legacy = joined.toUpperCase()
  return LEGACY.test(legacy) ? legacy : null
}

export function isWordCode(code) {
  return typeof code === 'string' && code.includes('-') && !isPictureCode(code)
}

/** Words of a canonical code in the given language ('th' | 'en'); picture names for picture codes. */
export function codeWords(code, lang) {
  if (isPictureCode(code)) return pictureIds(code).map(id => PICTURES[id][lang === 'th' ? 1 : 0])
  if (!isWordCode(code)) return [code]
  return code.split('-').map(w => {
    const forms = WORDS[LOOKUP.get(w)]
    return lang === 'th' ? forms[1] : forms[0]
  })
}

export function displayCode(code, lang) {
  return codeWords(code, lang).join(' · ')
}
