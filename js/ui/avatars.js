// Space mascots: 16 hand-drawn SVG characters in one sticker style — rounded shapes, the
// same thick dark-purple outline on every piece, a bright little face and very few details,
// so they stay readable at icon size. Bodies take the device colour (--tint); accents use a
// small fixed palette (cream, pink, lavender). Same look on every OS, unlike emoji.
//
// Classes (styled in style.css):
//   sp-body (device colour) / sp-light / sp-cream / sp-pink / sp-shade / sp-glass
//     → filled shapes, all with the same outline
//   sp-dot  → small inner details without outline (craters, lights)
//   sp-ol + sp-lc[-light|-cream] → outlined rounded lines (outline stroke, then colour on top)
//   sp-visor, sp-eye, sp-glint, sp-mouth, sp-cheek, sp-spark → face and sparkle bits

import {AVATARS} from '../identity.js'

function face(cx, cy, s = 1, light = false) {
  return `<g class="sp-face${light ? ' sp-face-light' : ''}">
    <circle class="sp-eye" cx="${cx - 5 * s}" cy="${cy - 1.5 * s}" r="${2.5 * s}"/>
    <circle class="sp-eye" cx="${cx + 5 * s}" cy="${cy - 1.5 * s}" r="${2.5 * s}"/>
    <circle class="sp-glint" cx="${cx - 4.2 * s}" cy="${cy - 2.4 * s}" r="${0.9 * s}"/>
    <circle class="sp-glint" cx="${cx + 5.8 * s}" cy="${cy - 2.4 * s}" r="${0.9 * s}"/>
    <path class="sp-mouth" d="M${cx - 3 * s} ${cy + 3 * s} q${3 * s} ${3.2 * s} ${6 * s} 0" stroke-width="${2 * s}"/>
    <ellipse class="sp-cheek" cx="${cx - 8.5 * s}" cy="${cy + 2.6 * s}" rx="${2.5 * s}" ry="${1.6 * s}"/>
    <ellipse class="sp-cheek" cx="${cx + 8.5 * s}" cy="${cy + 2.6 * s}" rx="${2.5 * s}" ry="${1.6 * s}"/>
  </g>`
}

/** An outlined rounded line: dark outline underneath, colour on top. */
function line(d, colour = 'light', w = 3.4) {
  return `<path class="sp-ol" d="${d}" stroke-width="${w + 4.4}"/><path class="sp-lc sp-lc-${colour}" d="${d}" stroke-width="${w}"/>`
}

/** A tiny four-point sparkle. */
function spark(x, y, r = 3.5) {
  return `<path class="sp-spark" d="M${x} ${y - r}Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y}Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r}Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y}Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r}Z"/>`
}

const SHAPES = {
  saturn: `
    ${line('M7 41C11 28 51 17 57 27', 'cream', 3.2)}
    <circle class="sp-body" cx="32" cy="32" r="15"/>
    ${line('M7 41C12 49 45 44 57 27', 'cream', 3.2)}
    ${face(32, 31)}
    ${spark(53, 9)}`,
  moon: `
    <circle class="sp-body" cx="32" cy="32" r="19"/>
    <circle class="sp-dot sp-dot-shade" cx="22.5" cy="22" r="3.4"/>
    <circle class="sp-dot sp-dot-shade" cx="43" cy="42" r="4"/>
    ${face(32, 34)}`,
  star: `
    <path class="sp-body" d="M32 9.5L38.4 24.8L54.5 26.2L42.2 36.9L45.8 52.6L32 44.3L18.2 52.6L21.8 36.9L9.5 26.2L25.6 24.8Z"/>
    ${face(32, 35, 0.85)}`,
  // a round head racing down-left, three soft speed streaks trailing behind it
  comet: `
    ${line('M30 32L54 9', 'light', 7.5)}
    ${line('M21 30L36 10', 'cream', 4)}
    ${line('M34 40L57 27', 'cream', 4)}
    ${spark(56, 18, 2.8)}
    <circle class="sp-body" cx="24" cy="40" r="14.5"/>
    ${face(24, 40.5, 0.9)}`,
  sun: `
    ${line('M32 5v5M32 54v5M5 32h5M54 32h5M13 13l3.5 3.5M47.5 47.5L51 51M13 51l3.5-3.5M47.5 16.5L51 13', 'cream', 3.4)}
    <circle class="sp-body" cx="32" cy="32" r="16"/>
    ${face(32, 32)}`,
  rocket: `
    <path class="sp-cream" d="M26.5 45Q32 59 37.5 45Z"/>
    <path class="sp-shade" d="M22 33L13.5 45.5L23 45Z"/>
    <path class="sp-shade" d="M42 33L50.5 45.5L41 45Z"/>
    <path class="sp-body" d="M32 5C43 13 45 28 42 46H22C19 28 21 13 32 5Z"/>
    <circle class="sp-glass" cx="32" cy="25.5" r="8.5"/>
    ${face(32, 26, 0.62)}`,
  saucer: `
    <path class="sp-glass" d="M19 32a13 13 0 0 1 26 0Z"/>
    ${face(32, 25.5, 0.62)}
    <ellipse class="sp-body" cx="32" cy="36" rx="26" ry="9"/>
    <circle class="sp-dot sp-dot-cream" cx="17" cy="37" r="2.2"/>
    <circle class="sp-dot sp-dot-cream" cx="32" cy="40" r="2.2"/>
    <circle class="sp-dot sp-dot-cream" cx="47" cy="37" r="2.2"/>
    ${spark(54, 14)}`,
  // solar-panel wings (with cells) on little arms, a dish on top sending out signal waves
  satellite: `
    ${line('M14 35H50', 'light', 2.6)}
    <rect class="sp-light" x="2.5" y="27" width="15" height="16" rx="2.5"/>
    <path class="sp-thin" d="M10 27.5v15M3 35h14" stroke-width="1.3"/>
    <rect class="sp-light" x="46.5" y="27" width="15" height="16" rx="2.5"/>
    <path class="sp-thin" d="M54 27.5v15M47 35h14" stroke-width="1.3"/>
    ${line('M32 24V17', 'light', 2.6)}
    <path class="sp-cream" d="M22.5 11Q32 23 41.5 11Z"/>
    <circle class="sp-pink" cx="32" cy="10.5" r="2.4"/>
    ${line('M45 5.5q3 3 0 6.5', 'cream', 2)}
    ${line('M49.5 3q5 5.5 0 11.5', 'cream', 2)}
    <rect class="sp-body" x="21" y="23" width="22" height="24" rx="9"/>
    ${face(32, 35, 0.72)}`,
  astro: `
    <rect class="sp-body" x="21" y="40" width="22" height="18" rx="8.5"/>
    <circle class="sp-body" cx="32" cy="27" r="18"/>
    <rect class="sp-visor" x="19" y="18.5" width="26" height="17.5" rx="8.75"/>
    ${face(32, 27.5, 0.8, true)}`,
  alien: `
    ${line('M25 19L20.5 10.5M39 19l4.5-8.5', 'light', 3)}
    <circle class="sp-pink" cx="20" cy="9" r="3.6"/>
    <circle class="sp-pink" cx="44" cy="9" r="3.6"/>
    <ellipse class="sp-body" cx="32" cy="35" rx="19" ry="17"/>
    <ellipse class="sp-eye" cx="25" cy="33" rx="4.2" ry="5.2"/>
    <ellipse class="sp-eye" cx="39" cy="33" rx="4.2" ry="5.2"/>
    <circle class="sp-glint" cx="26.3" cy="31.2" r="1.4"/>
    <circle class="sp-glint" cx="40.3" cy="31.2" r="1.4"/>
    <path class="sp-mouth" d="M28.5 42q3.5 3 7 0" stroke-width="2"/>
    <ellipse class="sp-cheek" cx="18.5" cy="41" rx="2.5" ry="1.6"/>
    <ellipse class="sp-cheek" cx="45.5" cy="41" rx="2.5" ry="1.6"/>`,
  planet: `
    <circle class="sp-body" cx="31" cy="34" r="18"/>
    <path class="sp-dot sp-dot-shade" d="M15.5 30c4-2 7 1.5 10.5-.5s2.5-6.5 0-9c-5 1.2-8.8 4.8-10.5 9.5Z"/>
    <path class="sp-dot sp-dot-shade" d="M38 48c-.5-3.5 3-5.5 6.5-4.5s3.8-3 5-4.5c-.6 4.5-5 8.5-11.5 9Z"/>
    <circle class="sp-cream" cx="53" cy="13" r="4.5"/>
    ${face(31, 35)}`,
  asteroid: `
    <path class="sp-body" d="M21 13.5C28 9 38 9 46 14.5C53 19 56 28 53.5 37C51 46 43 53 33 54C23 55 14 49 11 40C8 30 13 18.5 21 13.5Z"/>
    <circle class="sp-dot sp-dot-shade" cx="44" cy="22" r="3.4"/>
    <circle class="sp-dot sp-dot-shade" cx="19" cy="43" r="2.6"/>
    ${face(32, 34)}`,
  nebula: `
    <path class="sp-body" d="M15 47C8 47 6.5 37 12.5 34.5C11 26 19 21 25 24.5C27.5 15 41 14.5 44 23.5C50 21 57 27 53.5 34C59.5 37.5 57 47 50 47Z"/>
    ${spark(11, 15, 3.2)}
    ${spark(54, 14, 2.6)}
    ${face(32, 36)}`,
  galaxy: `
    ${line('M10.5 29A22.5 22.5 0 0 1 38 9.5', 'light', 3.4)}
    ${line('M53.5 35A22.5 22.5 0 0 1 26 54.5', 'light', 3.4)}
    <circle class="sp-body" cx="32" cy="32" r="14"/>
    ${face(32, 32, 0.8)}`,
  luna: `
    <path class="sp-body" d="M39 8A24 24 0 1 0 55.5 44A19 19 0 1 1 39 8Z"/>
    ${face(23.5, 34, 0.85)}
    ${spark(50, 18, 3.6)}`,
  // a little moon buggy: rounded cab, two big wheels, an antenna and a flag
  rover: `
    ${line('M19 24V9', 'light', 2.2)}
    <path class="sp-pink" d="M19.5 9.5h9.5l-2.6 3.4 2.6 3.4h-9.5Z"/>
    ${line('M45 24V14', 'light', 2.6)}
    <circle class="sp-cream" cx="45" cy="11.5" r="3.4"/>
    <rect class="sp-light" x="8" y="40" width="48" height="6" rx="3"/>
    <path class="sp-body" d="M10 42L13.5 27Q14.8 22 20 22H44Q49.2 22 50.5 27L54 42Z"/>
    <circle class="sp-shade" cx="18.5" cy="48" r="8"/>
    <circle class="sp-cream" cx="18.5" cy="48" r="2.8"/>
    <circle class="sp-shade" cx="45.5" cy="48" r="8"/>
    <circle class="sp-cream" cx="45.5" cy="48" r="2.8"/>
    ${face(32, 32.5, 0.85)}`,
}

if (AVATARS.some(id => !SHAPES[id])) throw new Error('every avatar id needs a drawing')

/** Inline SVG for a space mascot. Body colour comes from --tint on an ancestor. */
export function avatarSvg(id) {
  return `<svg class="space-avatar" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${SHAPES[id] || SHAPES.planet}</svg>`
}
