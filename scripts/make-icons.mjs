// Renders the app icons (PNG) without any image library: `node scripts/make-icons.mjs`
// Draws the logo — a smiling planet with two little devices on a dashed orbit — on a
// night-sky rounded square, matching icons/icon.svg and the header logo.
import {writeFileSync} from 'node:fs'
import {deflateSync, crc32} from 'node:zlib'
import {resolve} from 'node:path'

const out = resolve(import.meta.dirname, '..', 'icons')

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const BG_A = hex('#2e2a72')
const BG_B = hex('#141634')
const OUTLINE = hex('#2b2363')
const PLANET = hex('#ffc3d6')
const ORBIT = hex('#b9a2ff')
const MOON_A = hex('#8fe6f2')
const MOON_B = hex('#ffeec2')
const CHEEK = hex('#ff8fb5')
const WHITE = [255, 255, 255]

// All geometry in a 64x64 design space (same numbers as icons/icon.svg).
const C = {x: 32, y: 32}

function roundedRectSdf(x, y, inset, radius) {
  const hw = 32 - inset
  const qx = Math.abs(x - 32) - (hw - radius)
  const qy = Math.abs(y - 32) - (hw - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

const mix = (rgb, color, a) => rgb.map((v, k) => v + (color[k] - v) * a)

/** A filled circle with an outline: returns the new colour at (x, y). */
function disc(rgb, x, y, cx, cy, r, fill, outlineW) {
  const d = Math.hypot(x - cx, y - cy)
  if (d < r - outlineW / 2) return fill
  if (d < r + outlineW / 2) return OUTLINE
  return rgb
}

function shade(x, y, maskable) {
  // background
  const inside = maskable ? -1 : roundedRectSdf(x, y, 0, 15)
  if (inside > 0) return [0, 0, 0, 0]
  const t = Math.min(1, Math.max(0, (x + y) / 128))
  let rgb = BG_A.map((a, k) => a + (BG_B[k] - a) * t)
  rgb = mix(rgb, [150, 130, 255], Math.max(0, 1 - Math.hypot(x - C.x, y - C.y) / 30) * 0.35)

  // dashed orbit, r = 23
  const dx = x - C.x
  const dy = y - C.y
  const dist = Math.hypot(dx, dy)
  if (Math.abs(dist - 23) < 0.9) {
    const along = (Math.atan2(dy, dx) + Math.PI) * 23 // arc length
    if (along % 6.8 < 2.6) rgb = mix(rgb, ORBIT, 0.8)
  }
  rgb = disc(rgb, x, y, 48.3, 15.7, 4.4, MOON_A, 1.6)
  rgb = disc(rgb, x, y, 15.7, 48.3, 3.3, MOON_B, 1.5)

  // planet with a little face
  rgb = disc(rgb, x, y, 32, 32, 14, PLANET, 2.6)
  if (dist < 12.7) {
    if (Math.hypot(x - 27, y - 26) < 2.9) rgb = mix(rgb, WHITE, 0.7)
    for (const cx of [23.7, 40.3]) {
      if (((x - cx) / 2.1) ** 2 + ((y - 36.1) / 1.3) ** 2 < 1) rgb = mix(rgb, CHEEK, 0.65)
    }
    if (Math.hypot(x - 27.5, y - 32.6) < 1.9 || Math.hypot(x - 36.5, y - 32.6) < 1.9) rgb = OUTLINE
    // smile: lower part of a small circle centred above the mouth
    const sd = Math.hypot(x - 32, y - 35.1)
    if (y > 36.2 && Math.abs(sd - 2.6) < 0.9) rgb = OUTLINE
  }
  return [...rgb, 255]
}

function render(size, maskable) {
  // Maskable icons keep content inside the central safe zone, so shrink the drawing.
  const scale = maskable ? 0.78 : 1
  const SS = 4
  const px = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      const acc = [0, 0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          let x = ((pxi + (sx + 0.5) / SS) / size) * 64
          let y = ((py + (sy + 0.5) / SS) / size) * 64
          x = 32 + (x - 32) / scale
          y = 32 + (y - 32) / scale
          const [r, g, b, a] = shade(x, y, maskable)
          acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
        }
      }
      const o = (py * size + pxi) * 4
      const a = acc[3] / (SS * SS)
      px[o] = acc[3] ? Math.round(acc[0] / acc[3]) : 0
      px[o + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0
      px[o + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0
      px[o + 3] = Math.round(a)
    }
  }
  return px
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  writeFileSync(resolve(out, name), png(size, render(size, maskable)))
  console.log('wrote', name)
}
