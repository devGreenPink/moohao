// The starry background. A canvas is painted once (and again on resize / theme change)
// with nebula clouds, a faint Milky Way band and a few hundred stars of varied size and
// colour; a handful of DOM stars twinkle on top (cheap opacity animations), and an
// occasional shooting star crosses the sky unless the user prefers reduced motion.

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
    nebulae: [
      [0.18, 0.22, 0.55, 'rgba(140, 95, 255, 0.20)'],
      [0.86, 0.68, 0.5, 'rgba(255, 120, 190, 0.13)'],
      [0.62, 0.12, 0.4, 'rgba(90, 170, 255, 0.13)'],
      [0.3, 0.88, 0.45, 'rgba(70, 210, 220, 0.08)'],
    ],
    band: 'rgba(205, 195, 255, 0.11)',
    starColors: ['255,255,255', '255,255,255', '214,226,255', '255,236,205', '222,208,255'],
    starAlpha: [0.25, 0.9],
    density: 1,
  },
  dawn: {
    nebulae: [
      [0.18, 0.22, 0.55, 'rgba(170, 140, 255, 0.16)'],
      [0.86, 0.68, 0.5, 'rgba(255, 160, 200, 0.14)'],
      [0.62, 0.12, 0.4, 'rgba(120, 200, 255, 0.12)'],
    ],
    band: 'rgba(150, 120, 240, 0.07)',
    starColors: ['138,104,240', '120,150,230', '200,120,180'],
    starAlpha: [0.12, 0.4],
    density: 0.35,
  },
}

import {effectsOn} from './effects.js'

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
    ctx.clearRect(0, 0, w, h)
    const big = Math.max(w, h)
    const rand = rng(20261114)

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

    // stars: mostly tiny, a few bright ones with a glow
    const count = Math.min(1100, Math.round((w * h) / 1700 * p.density))
    const [a0, a1] = p.starAlpha
    for (let i = 0; i < count; i++) {
      const x = rand() * w
      const y = rand() * h
      const roll = rand()
      const size = roll > 0.985 ? 1.6 + rand() * 0.9 : roll > 0.9 ? 1 + rand() * 0.6 : 0.4 + rand() * 0.6
      const alpha = a0 + rand() * (a1 - a0)
      const rgb = p.starColors[Math.floor(rand() * p.starColors.length)]
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
  }

  // a few twinkling stars on top
  const r = rng(77)
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span')
    s.className = 'star'
    s.style.left = `${r() * 100}%`
    s.style.top = `${r() * 100}%`
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
      if (!document.hidden && effectsOn() && theme === 'night') {
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
