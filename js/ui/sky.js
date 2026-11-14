/** Scatter a few softly twinkling stars over the background layer. Purely decorative. */
export function scatterStars(layer, count = 26) {
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    s.className = 'star'
    s.style.left = `${Math.random() * 100}%`
    s.style.top = `${Math.random() * 100}%`
    s.style.setProperty('--size', `${1 + Math.random() * 2.2}px`)
    s.style.setProperty('--dur', `${3 + Math.random() * 4}s`)
    s.style.animationDelay = `${-Math.random() * 6}s`
    frag.append(s)
  }
  layer.append(frag)
}
