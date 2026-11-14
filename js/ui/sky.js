// The space background. A canvas is painted once (and again on resize / theme change):
// a sky gradient, nebula clouds, a faint Milky Way band, a few hundred tiny stars, bigger
// four-point sparkles, the curve of a planet rising at the bottom edge, and on wide screens
// a few sticker-style planets near the edges (same look as the mascots). On top, a handful
// of DOM stars twinkle (cheap opacity animations) and an occasional shooting star crosses
// the sky unless effects are off.
//
// Two looks: "night" (deep indigo) and "dawn" (a dusk sky seen from space: periwinkle at the
// top fading to lilac and a peach glow behind the planet).

function rng(seed) {
  // mulberry32: deterministic, so a resize doesn't reshuffle the sky
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = r => (r() + r() + r() + r() - 2) / 2 // roughly normal, range ±1

const PALETTES = {
  night: {
    sky: [[0, '#090a22'], [0.55, '#10113a'], [1, '#1a1548']],
    nebulae: [
      [0.18, 0.22, 0.55, 'rgba(140, 95, 255, 0.20)'],
      [0.86, 0.6, 0.5, 'rgba(255, 120, 190, 0.13)'],
      [0.62, 0.12, 0.4, 'rgba(90, 170, 255, 0.13)'],
      [0.3, 0.88, 0.45, 'rgba(70, 210, 220, 0.08)'],
    ],
    band: 'rgba(205, 195, 255, 0.11)',
    starColors: ['255,255,255', '255,255,255', '214,226,255', '255,236,205', '222,208,255'],
    starAlpha: [0.25, 0.9],
    density: 1,
    fadeLow: 0.15, // tiny stars thin out toward the planet
    sparkles: ['#fff4d6', '#ffd1e0', '#d9ccff', '#bff3fa'],
    sparkleGlow: 'rgba(200, 185, 255, 0.9)',
    planet: {
      glow: 'rgba(150, 120, 255, 0.22)',
      body: [[0, 'rgba(44, 38, 118, 0)'], [0.5, 'rgba(36, 31, 100, 0.75)'], [1, 'rgba(22, 18, 62, 0.9)']],
      rim: 'rgba(205, 190, 255, 0.4)',
    },
    decor: {outline: 'rgba(16, 14, 48, 0.95)', alpha: 0.85},
  },
  dawn: {
    sky: [[0, '#b9b2f2'], [0.45, '#ddd3fa'], [0.8, '#f6dcef'], [1, '#ffd6dd']],
    nebulae: [
      [0.14, 0.2, 0.5, 'rgba(126, 104, 236, 0.22)'],
      [0.88, 0.32, 0.45, 'rgba(255, 150, 190, 0.20)'],
      [0.55, 0.05, 0.4, 'rgba(110, 140, 255, 0.16)'],
    ],
    band: 'rgba(255, 255, 255, 0.22)',
    starColors: ['255,255,255', '255,255,255', '92,79,214'],
    starAlpha: [0.35, 0.9],
    density: 0.45,
    fadeLow: 0.55, // daylight washes the stars out lower down
    sparkles: ['#ffffff', '#ffffff', '#6c5ce7', '#f07fa0', '#fff3c4'],
    sparkleGlow: 'rgba(108, 92, 231, 0.55)',
    planet: {
      glow: 'rgba(255, 160, 185, 0.38)',
      body: [[0, 'rgba(240, 200, 232, 0)'], [0.5, 'rgba(214, 192, 245, 0.7)'], [1, 'rgba(178, 160, 238, 0.85)']],
      rim: 'rgba(255, 255, 255, 0.6)',
    },
    decor: {outline: '#3d3283', alpha: 1},
  },
}

// pastel sticker colours shared with the mascots (css: --sp-cream, --sp-pink, --sp-lav)
const CREAM = '#ffeec2'
const PINK = '#ffc3d6'
const LAV = '#cdbfff'

import {effectsOn} from './effects.js'

/** Four-point sparkle, like the ones next to the mascots. */
function sparklePath(ctx, x, y, r) {
  const k = r * 0.22
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x + k, y - k, x + r, y)
  ctx.quadraticCurveTo(x + k, y + k, x, y + r)
  ctx.quadraticCurveTo(x - k, y + k, x - r, y)
  ctx.quadraticCurveTo(x - k, y - k, x, y - r)
  ctx.closePath()
}

function outlined(ctx, outline, width, fill) {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = width
  ctx.strokeStyle = outline
  ctx.stroke()
}

/** A ringed planet in the mascots' sticker style (back half of the ring, body, front half). */
function ringedPlanet(ctx, x, y, r, outline) {
  const ring = front => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.35)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 1.85, r * 0.5, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
    ctx.lineCap = 'round'
    ctx.lineWidth = r * 0.3 + 3.2
    ctx.strokeStyle = outline
    ctx.stroke()
    ctx.lineWidth = r * 0.3
    ctx.strokeStyle = CREAM
    ctx.stroke()
    ctx.restore()
  }
  ring(false)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  outlined(ctx, outline, 2.2, PINK)
  ctx.beginPath()
  ctx.arc(x - r * 0.35, y - r * 0.3, r * 0.22, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fill()
  ring(true)
}

function moon(ctx, x, y, r, outline) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  outlined(ctx, outline, 2, CREAM)
  ctx.fillStyle = 'rgba(214, 180, 120, 0.45)'
  for (const [dx, dy, cr] of [[-0.3, -0.2, 0.22], [0.32, 0.25, 0.17], [-0.05, 0.42, 0.12]]) {
    ctx.beginPath()
    ctx.arc(x + dx * r, y + dy * r, cr * r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function tinyPlanet(ctx, x, y, r, outline) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  outlined(ctx, outline, 1.8, LAV)
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fill()
}

export function createSky({canvas, twinkleLayer, shootLayer}) {
  let theme = 'night'

  function paint() {
    const p = PALETTES[theme]
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const big = Math.max(w, h)
    const rand = rng(20261114)

    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    for (const [stop, color] of p.sky) sky.addColorStop(stop, color)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // nebula clouds
    for (const [x, y, r, color] of p.nebulae) {
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * big)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    // Milky Way: a soft diagonal band with extra faint stars along it
    const diag = Math.hypot(w, h)
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(-0.42)
    ctx.save()
    ctx.scale(1, 0.16)
    const band = ctx.createRadialGradient(0, 0, 0, 0, 0, diag * 0.62)
    band.addColorStop(0, p.band)
    band.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = band
    ctx.fillRect(-diag, -diag * 4, diag * 2, diag * 8)
    ctx.restore()
    const bandStars = Math.round((w * h) / 4200 * p.density)
    for (let i = 0; i < bandStars; i++) {
      const x = (rand() - 0.5) * diag
      const y = gauss(rand) * diag * 0.07
      ctx.fillStyle = `rgba(${p.starColors[i % p.starColors.length]},${(p.starAlpha[0] * 0.7 + rand() * 0.25).toFixed(2)})`
      ctx.fillRect(x, y, 0.8, 0.8)
    }
    ctx.restore()

    // tiny stars: mostly small, a few bright ones with a glow; fewer toward the horizon
    const count = Math.min(1100, Math.round((w * h) / 1700 * p.density))
    const [a0, a1] = p.starAlpha
    for (let i = 0; i < count; i++) {
      const x = rand() * w
      const y = rand() * h
      const roll = rand()
      const size = roll > 0.985 ? 1.6 + rand() * 0.9 : roll > 0.9 ? 1 + rand() * 0.6 : 0.4 + rand() * 0.6
      const fade = Math.max(0, 1 - Math.max(0, y / h - (1 - p.fadeLow * 1.6)) / (p.fadeLow * 1.6))
      const alpha = (a0 + rand() * (a1 - a0)) * fade
      const rgb = p.starColors[Math.floor(rand() * p.starColors.length)]
      if (alpha < 0.03) continue
      if (size > 1.5) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 4)
        glow.addColorStop(0, `rgba(${rgb},${(alpha * 0.5).toFixed(2)})`)
        glow.addColorStop(1, `rgba(${rgb},0)`)
        ctx.fillStyle = glow
        ctx.fillRect(x - size * 4, y - size * 4, size * 8, size * 8)
      }
      ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(2)})`
      ctx.beginPath()
      ctx.arc(x, y, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // four-point sparkles, mostly in the upper part of the sky
    const sparkles = Math.round(Math.min(46, Math.max(14, (w * h) / 38000)))
    // (the glow is a small radial gradient, not shadowBlur: blurred shadows are slow to
    // rasterise on a big high-DPI canvas, and the sky repaints on resize / theme change)
    ctx.save()
    for (let i = 0; i < sparkles; i++) {
      const x = rand() * w
      const y = Math.pow(rand(), 1.6) * h * 0.78
      const r = 2.2 + Math.pow(rand(), 2) * 5
      ctx.globalAlpha = 0.55 + rand() * 0.45
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4)
      glow.addColorStop(0, p.sparkleGlow)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.globalAlpha *= 0.45
      ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8)
      ctx.globalAlpha /= 0.45
      sparklePath(ctx, x, y, r)
      ctx.fillStyle = p.sparkles[i % p.sparkles.length]
      ctx.fill()
    }
    ctx.restore()

    // A planet just peeking in at the bottom edge: a wide, low curve whose top fades into the
    // sky and a soft glow instead of an outline, so it reads as depth, not as an object.
    const R = big * 1.8
    const show = Math.min(h * 0.08, 72)
    const cx = w * 0.5
    const cy = h + R - show
    const top = h - show
    const atmo = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R + 110)
    atmo.addColorStop(0, p.planet.glow)
    atmo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = atmo
    ctx.fillRect(0, top - 120, w, show + 120)
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    const body = ctx.createLinearGradient(0, top, 0, h)
    for (const [stop, color] of p.planet.body) body.addColorStop(stop, color)
    ctx.fillStyle = body
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, Math.PI * 1.3, Math.PI * 1.7)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = p.planet.rim
    ctx.shadowColor = p.planet.rim
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.restore()

    // sticker planets near the edges (wide screens only; on phones the content covers them)
    if (w >= 760) {
      ctx.save()
      ctx.globalAlpha = p.decor.alpha
      const o = p.decor.outline
      ringedPlanet(ctx, w * 0.085, h * 0.27, 21, o)
      moon(ctx, w * 0.93, h * 0.2, 13, o)
      tinyPlanet(ctx, w * 0.88, h * 0.64, 8, o)
      ctx.shadowColor = p.sparkleGlow
      ctx.shadowBlur = 8
      sparklePath(ctx, w * 0.13, h * 0.16, 6)
      ctx.fillStyle = CREAM
      ctx.fill()
      sparklePath(ctx, w * 0.9, h * 0.31, 4)
      ctx.fill()
      ctx.restore()
    }
  }

  // a few twinkling stars on top
  const r = rng(77)
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span')
    s.className = 'star'
    s.style.left = `${r() * 100}%`
    s.style.top = `${r() * 70}%`
    s.style.setProperty('--size', `${1.5 + r() * 1.8}px`)
    s.style.setProperty('--dur', `${3 + r() * 4}s`)
    s.style.animationDelay = `${-r() * 6}s`
    twinkleLayer.append(s)
  }

  // occasional shooting star
  let shootTimer = 0
  function scheduleShootingStar() {
    clearTimeout(shootTimer)
    shootTimer = setTimeout(() => {
      if (!document.hidden && effectsOn()) {
        const s = document.createElement('span')
        s.className = 'shooting-star'
        s.style.left = `${10 + Math.random() * 70}%`
        s.style.top = `${Math.random() * 40}%`
        s.addEventListener('animationend', () => s.remove(), {once: true})
        shootLayer.append(s)
      }
      scheduleShootingStar()
    }, 9000 + Math.random() * 14000)
  }

  // Repaint on real size changes only: mobile browsers fire resize while the address bar
  // slides in and out, which would otherwise repaint the whole sky during scrolling.
  let painted = {w: 0, h: 0}
  let resizeTimer = 0
  const repaintIfResized = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    if (w === painted.w && Math.abs(h - painted.h) < 140) return
    painted = {w, h}
    paint()
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(repaintIfResized, 150)
  })
  painted = {w: window.innerWidth, h: window.innerHeight}

  paint()
  scheduleShootingStar()

  return {
    setTheme(next) {
      if (next === theme) return
      theme = next
      paint()
    },
  }
}
