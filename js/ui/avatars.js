// Space mascots: 16 hand-drawn SVG characters that take the device's colour (--tint) and
// share one cute face, so they look the same on every OS (unlike emoji) and fit the night
// radar. Each has its own silhouette, so devices differ by shape as well as colour.
//
// Classes (styled in style.css): sp-body = main colour, sp-shade = darker detail,
// sp-light = lighter detail, sp-line / sp-sline / sp-lline = strokes (dark / shade / light),
// sp-glass = see-through glass,
// sp-eye / sp-mouth = the face, sp-cheek = blush.

import {AVATARS} from '../identity.js'

function face(cx, cy, s = 1) {
  const e = 2.3 * s
  return `<g class="sp-face">
    <circle class="sp-eye" cx="${cx - 5 * s}" cy="${cy - 1.5 * s}" r="${e}"/>
    <circle class="sp-eye" cx="${cx + 5 * s}" cy="${cy - 1.5 * s}" r="${e}"/>
    <circle class="sp-glint" cx="${cx - 4.3 * s}" cy="${cy - 2.3 * s}" r="${0.8 * s}"/>
    <circle class="sp-glint" cx="${cx + 5.7 * s}" cy="${cy - 2.3 * s}" r="${0.8 * s}"/>
    <path class="sp-mouth" d="M${cx - 3 * s} ${cy + 3 * s} q${3 * s} ${3 * s} ${6 * s} 0" stroke-width="${1.8 * s}"/>
    <ellipse class="sp-cheek" cx="${cx - 8.5 * s}" cy="${cy + 2.5 * s}" rx="${2.4 * s}" ry="${1.5 * s}"/>
    <ellipse class="sp-cheek" cx="${cx + 8.5 * s}" cy="${cy + 2.5 * s}" rx="${2.4 * s}" ry="${1.5 * s}"/>
  </g>`
}

const SHAPES = {
  saturn: `
    <ellipse class="sp-line" cx="32" cy="34" rx="27" ry="8" transform="rotate(-16 32 34)" stroke-width="3.2"/>
    <circle class="sp-body" cx="32" cy="32" r="16"/>
    <path class="sp-light" d="M21 25a13 13 0 0 1 9-8 16 16 0 0 0-9 8Z"/>
    <path class="sp-line" d="M9.5 42.5C18 47 40 43 55 30" stroke-width="3.2"/>
    ${face(32, 31)}`,
  moon: `
    <circle class="sp-body" cx="32" cy="32" r="19"/>
    <circle class="sp-shade" cx="22" cy="21" r="3.6"/>
    <circle class="sp-shade" cx="44" cy="42" r="4.6"/>
    <circle class="sp-shade" cx="42" cy="20" r="2.2"/>
    <circle class="sp-shade" cx="19" cy="40" r="2"/>
    ${face(32, 33)}`,
  star: `
    <path class="sp-body sp-round" d="M32 11L37.9 25.4L52.9 26.7L41.5 36.6L44.9 51.3L32 43.5L19.1 51.3L22.5 36.6L11.1 26.7L26.1 25.4Z"/>
    ${face(32, 34, 0.85)}`,
  comet: `
    <path class="sp-lline" d="M33 30L57 9" stroke-width="5"/>
    <path class="sp-sline" d="M36 36L60 23" stroke-width="4"/>
    <path class="sp-sline" d="M29 26L46 5" stroke-width="3.5"/>
    <circle class="sp-body" cx="25" cy="38" r="15"/>
    ${face(25, 38, 0.9)}`,
  sun: `
    <g class="sp-rays">
      <path d="M32 5v7M32 52v7M5 32h7M52 32h7M12.9 12.9l5 5M46.1 46.1l5 5M12.9 51.1l5-5M46.1 17.9l5-5"/>
    </g>
    <circle class="sp-body" cx="32" cy="32" r="16"/>
    ${face(32, 32)}`,
  rocket: `
    <path class="sp-flame" d="M26 46Q32 62 38 46Z"/>
    <path class="sp-shade" d="M22 34L12 47L22 45ZM42 34L52 47L42 45Z"/>
    <path class="sp-body" d="M32 5C43 13 45 28 42 46H22C19 28 21 13 32 5Z"/>
    <circle class="sp-glass" cx="32" cy="26" r="8.5"/>
    ${face(32, 26.5, 0.62)}`,
  saucer: `
    <path class="sp-glass" d="M18 31a14 14 0 0 1 28 0Z"/>
    ${face(32, 25, 0.62)}
    <ellipse class="sp-body" cx="32" cy="35" rx="26" ry="9"/>
    <ellipse class="sp-shade" cx="32" cy="38" rx="14" ry="3.5"/>
    <circle class="sp-light" cx="14" cy="35" r="2"/>
    <circle class="sp-light" cx="50" cy="35" r="2"/>
    <circle class="sp-light" cx="32" cy="42" r="2"/>
    <path class="sp-line" d="M24 44l-4 9M40 44l4 9" stroke-width="2.5"/>`,
  satellite: `
    <rect class="sp-shade" x="2" y="25" width="16" height="14" rx="2"/>
    <rect class="sp-shade" x="46" y="25" width="16" height="14" rx="2"/>
    <path class="sp-line" d="M10 25v14M54 25v14M18 32h4M42 32h4" stroke-width="1.6"/>
    <path class="sp-line" d="M32 21V12" stroke-width="2.4"/>
    <circle class="sp-light" cx="32" cy="10" r="3"/>
    <rect class="sp-body" x="21" y="21" width="22" height="22" rx="6"/>
    ${face(32, 32, 0.72)}`,
  astro: `
    <rect class="sp-body" x="20" y="40" width="24" height="18" rx="8"/>
    <circle class="sp-body" cx="32" cy="27" r="18"/>
    <rect class="sp-visor" x="19" y="19" width="26" height="17" rx="8.5"/>
    <g class="sp-face sp-face-light">
      <circle class="sp-eye" cx="27" cy="26.5" r="2.2"/><circle class="sp-eye" cx="37" cy="26.5" r="2.2"/>
      <path class="sp-mouth" d="M29.5 30.5q2.5 2.5 5 0" stroke-width="1.7"/>
    </g>
    <path class="sp-lline" d="M22 22a8 8 0 0 1 6-3" stroke-width="2"/>`,
  alien: `
    <path class="sp-line" d="M24 18L19 7M40 18l5-11" stroke-width="2.5"/>
    <circle class="sp-light" cx="19" cy="7" r="3.5"/>
    <circle class="sp-light" cx="45" cy="7" r="3.5"/>
    <ellipse class="sp-body" cx="32" cy="34" rx="19" ry="17"/>
    <ellipse class="sp-eye" cx="25" cy="32" rx="4" ry="5"/>
    <ellipse class="sp-eye" cx="39" cy="32" rx="4" ry="5"/>
    <circle class="sp-glint" cx="26.2" cy="30.3" r="1.3"/>
    <circle class="sp-glint" cx="40.2" cy="30.3" r="1.3"/>
    <path class="sp-mouth" d="M28.5 41q3.5 3 7 0" stroke-width="1.8"/>
    <ellipse class="sp-cheek" cx="18.5" cy="40" rx="2.4" ry="1.5"/>
    <ellipse class="sp-cheek" cx="45.5" cy="40" rx="2.4" ry="1.5"/>`,
  planet: `
    <circle class="sp-body" cx="32" cy="32" r="19"/>
    <path class="sp-shade" d="M15 27c5-2 7 2 11 0s3-7 0-10c-5 1-9 5-11 10ZM39 47c-1-4 3-6 7-5s4-4 6-6c0 5-5 10-13 11ZM44 18c-2 3 1 5 4 5 0-2-2-4-4-5Z"/>
    ${face(32, 33)}`,
  asteroid: `
    <path class="sp-body sp-round" d="M20 14L36 10L50 18L54 34L46 50L28 54L14 44L10 28Z"/>
    <circle class="sp-shade" cx="20" cy="24" r="3.2"/>
    <circle class="sp-shade" cx="44" cy="45" r="3.8"/>
    <circle class="sp-shade" cx="46" cy="22" r="2.2"/>
    ${face(32, 33)}`,
  nebula: `
    <circle class="sp-body" cx="21" cy="37" r="11"/>
    <circle class="sp-body" cx="43" cy="37" r="11"/>
    <circle class="sp-body" cx="32" cy="27" r="14"/>
    <rect class="sp-body" x="21" y="34" width="22" height="14"/>
    <path class="sp-light sp-round" d="M51 12l1.5 3.5 3.5 1.5-3.5 1.5L51 22l-1.5-3.5L46 17l3.5-1.5ZM11 17l1 2.3 2.3 1-2.3 1L11 23.6l-1-2.3-2.3-1 2.3-1Z"/>
    ${face(32, 36)}`,
  galaxy: `
    <path class="sp-line" d="M32 32m-14 0a14 14 0 0 1 22-11.5M32 32m14 0a14 14 0 0 1-22 11.5" stroke-width="3.2"/>
    <path class="sp-sline" d="M8 26a24 24 0 0 1 30-17M56 38a24 24 0 0 1-30 17" stroke-width="3"/>
    <circle class="sp-body" cx="32" cy="32" r="11"/>
    ${face(32, 32, 0.68)}`,
  luna: `
    <path class="sp-body" d="M40 8A24 24 0 1 0 56 44A19 19 0 1 1 40 8Z"/>
    ${face(24, 34, 0.85)}`,
  rover: `
    <path class="sp-line" d="M42 24V13" stroke-width="2.5"/>
    <rect class="sp-light" x="37" y="6" width="11" height="8" rx="3"/>
    <rect class="sp-body" x="10" y="22" width="44" height="22" rx="7"/>
    <circle class="sp-shade" cx="18" cy="48" r="6"/>
    <circle class="sp-shade" cx="32" cy="48" r="6"/>
    <circle class="sp-shade" cx="46" cy="48" r="6"/>
    ${face(32, 32, 0.85)}`,
}

if (AVATARS.some(id => !SHAPES[id])) throw new Error('every avatar id needs a drawing')

/** Inline SVG for a space mascot. Colour comes from --tint on an ancestor. */
export function avatarSvg(id) {
  return `<svg class="space-avatar" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${SHAPES[id] || SHAPES.planet}</svg>`
}
