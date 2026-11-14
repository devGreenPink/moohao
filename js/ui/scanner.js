// In-app QR scanner. Uses the browser's BarcodeDetector when it can read QR codes
// (Chrome on Android / macOS), otherwise loads jsQR on demand.

export function scannerSupported() {
  return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats()
    if (!formats.includes('qr_code')) return null
    const detector = new window.BarcodeDetector({formats: ['qr_code']})
    return async source => (await detector.detect(source))[0]?.rawValue || null
  } catch {
    return null
  }
}

async function jsqrDetector() {
  const {jsQR} = await import('../../vendor/jsqr.js')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', {willReadFrequently: true})
  return async source => {
    const w0 = source.videoWidth || source.naturalWidth || source.width
    const h0 = source.videoHeight || source.naturalHeight || source.height
    if (!w0 || !h0) return null
    const scale = Math.min(1, 720 / Math.max(w0, h0))
    canvas.width = Math.round(w0 * scale)
    canvas.height = Math.round(h0 * scale)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(img.data, img.width, img.height, {inversionAttempts: 'attemptBoth'})?.data || null
  }
}

/** Returns async (imageOrVideo) => string|null. Exported for testing too. */
export async function makeDetector() {
  return (await nativeDetector()) || jsqrDetector()
}

/**
 * Open the camera inside `dialog` and look for a QR code.
 * accept(text) should return truthy when the text is something we can use; scanning then
 * stops and the dialog closes. Messages are shown through setStatus(key).
 */
export async function runScanner({dialog, video, setStatus, accept}) {
  let stream = null
  let stopped = false
  let timer = 0

  const stop = () => {
    stopped = true
    clearTimeout(timer)
    stream?.getTracks().forEach(tr => tr.stop())
    video.srcObject = null
  }
  dialog.addEventListener('close', stop, {once: true})

  setStatus('scanStarting')
  try {
    stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false})
  } catch (err) {
    setStatus(err?.name === 'NotAllowedError' ? 'camDenied' : 'camMissing')
    return
  }
  if (stopped) {
    stream.getTracks().forEach(tr => tr.stop())
    return
  }
  video.srcObject = stream
  await video.play().catch(() => {})
  const detect = await makeDetector()
  setStatus('scanAim')

  let lastBad = ''
  const tick = async () => {
    if (stopped) return
    try {
      const text = await detect(video)
      if (text && !stopped) {
        if (accept(text)) {
          if (dialog.open) dialog.close('scanned')
          return
        }
        if (text !== lastBad) {
          lastBad = text
          setStatus('scanNotNearby')
        }
      }
    } catch {}
    timer = setTimeout(tick, 180)
  }
  tick()
}
