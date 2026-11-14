// Renders the app icons (PNG) without any image library: `node scripts/make-icons.mjs`
// Draws a night-sky rounded square with radar arcs and a dot, matching icons/icon.svg.
import {writeFileSync} from 'node:fs'
import {deflateSync, crc32} from 'node:zlib'
import {resolve} from 'node:path'

const out = resolve(import.meta.dirname, '..', 'icons')

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const BG_A = hex('#2e2a72')
const BG_B = hex('#141634')
const ARCS = [
  {r: 11, color: hex('#f3f1ff'), alpha: 1},
  {r: 19, color: hex('#c2a8ff'), alpha: 0.95},
  {r: 27, color: hex('#8fe6f2'), alpha: 0.85},
]
const DOT = hex('#ffb4c8')

// All geometry in a 64x64 design space.
const C = {x: 32, y: 44}
const STROKE = 4.4
const SPAN = (52 * Math.PI) / 180

function roundedRectSdf(x, y, inset, radius) {
  const hw = 32 - inset
  const qx = Math.abs(x - 32) - (hw - radius)
  const qy = Math.abs(y - 32) - (hw - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function arcSdf(x, y, r) {
  const dx = x - C.x
  const dy = y - C.y
  const angle = Math.atan2(dx, -dy) // 0 = straight up
  if (Math.abs(angle) <= SPAN) return Math.abs(Math.hypot(dx, dy) - r) - STROKE / 2
  const s = Math.sign(angle) * SPAN
  const ex = C.x + Math.sin(s) * r
  const ey = C.y - Math.cos(s) * r
  return Math.hypot(x - ex, y - ey) - STROKE / 2
}

function shade(x, y, maskable) {
  // background
  const inside = maskable ? -1 : roundedRectSdf(x, y, 0, 15)
  if (inside > 0) return [0, 0, 0, 0]
  const t = Math.min(1, Math.max(0, (x + y) / 128))
  let rgb = BG_A.map((a, k) => a + (BG_B[k] - a) * t)
  // soft glow behind the dot
  const glow = Math.max(0, 1 - Math.hypot(x - C.x, y - C.y) / 30) * 0.35
  rgb = rgb.map((v, k) => v + ([150, 130, 255][k] - v) * glow)
  for (const arc of ARCS) {
    if (arcSdf(x, y, arc.r) < 0) rgb = rgb.map((v, k) => v + (arc.color[k] - v) * arc.alpha)
  }
  if (Math.hypot(x - C.x, y - C.y) < 4.6) rgb = DOT
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
