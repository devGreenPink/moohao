// Cute device mascots. Each device type has its own silhouette (tall phone, wide tablet,
// monitor on a stand) so type is never conveyed by colour alone. Colours come from CSS
// custom properties (--tint, --m-body, --m-screen), set per type in style.css.

const FACE = (cx, cy) => `
  <g class="m-face">
    <circle cx="${cx - 4}" cy="${cy - 1.5}" r="1.7"/>
    <circle cx="${cx + 4}" cy="${cy - 1.5}" r="1.7"/>
    <path d="M${cx - 3} ${cy + 2.6} q3 2.6 6 0"/>
  </g>
  <g class="m-cheek">
    <ellipse cx="${cx - 7.2}" cy="${cy + 2}" rx="1.9" ry="1.2"/>
    <ellipse cx="${cx + 7.2}" cy="${cy + 2}" rx="1.9" ry="1.2"/>
  </g>`

const SHAPES = {
  phone: `
    <rect class="m-body" x="19" y="7" width="26" height="50" rx="9"/>
    <rect class="m-screen" x="23.5" y="13" width="17" height="34" rx="5"/>
    <rect class="m-detail" x="28.5" y="9.6" width="7" height="1.6" rx=".8"/>
    <circle class="m-detail" cx="32" cy="52" r="1.6"/>
    ${FACE(32, 30)}`,
  tablet: `
    <rect class="m-body" x="9" y="12" width="46" height="40" rx="9"/>
    <rect class="m-screen" x="14" y="17" width="36" height="30" rx="5"/>
    <circle class="m-detail" cx="52" cy="32" r="1.3"/>
    ${FACE(32, 32)}`,
  desktop: `
    <rect class="m-body" x="7" y="10" width="50" height="35" rx="8"/>
    <rect class="m-screen" x="11.5" y="14.5" width="41" height="26" rx="4.5"/>
    <path class="m-stand" d="M27 45 l-2 8 h14 l-2 -8"/>
    ${FACE(32, 27.5)}`,
}

/** Returns an inline SVG string for a device mascot. */
export function mascot(device = 'desktop') {
  const shape = SHAPES[device] || SHAPES.desktop
  return `<svg class="mascot-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${shape}</svg>`
}

/** Small line icons used around the UI. */
export const ICONS = {
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  waves: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="w3" d="M3 9.5a13 13 0 0 1 18 0"/><path class="w2" d="M6 13a8.5 8.5 0 0 1 12 0"/><path class="w1" d="M9.2 16.4a4 4 0 0 1 5.6 0"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2h-15L6 16"/><path d="M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5 6.5 5h11l2.5 8.5V19H4v-5.5Z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4V8Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
}
